from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import httpx
from dotenv import dotenv_values, load_dotenv


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
DEFAULT_COMPOSE_FILE = "docker-compose.yml"


class DeployError(RuntimeError):
    pass


class PortainerApiError(DeployError):
    def __init__(self, method: str, path: str, status_code: int, detail: str) -> None:
        self.method = method
        self.path = path
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Portainer API {method} {path} failed: {status_code} {detail}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--list-endpoints", action="store_true")
    parser.add_argument("--stack-name", dest="stack_name")
    parser.add_argument("--endpoint-id", dest="endpoint_id", type=int)
    parser.add_argument("--endpoint-name", dest="endpoint_name")
    parser.add_argument("--repo-url", dest="repo_url")
    parser.add_argument("--branch", dest="branch")
    parser.add_argument("--compose-file", dest="compose_file")
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--timeout", type=float, default=30.0)
    return parser.parse_args()


def load_environment() -> dict[str, str]:
    load_dotenv(ENV_PATH, override=False)
    values = dotenv_values(ENV_PATH)
    env: dict[str, str] = {}
    for key, value in values.items():
        if value is None:
            continue
        env[key] = value
    for key, value in os.environ.items():
        env[key] = value
    return env


def load_project_env_values() -> dict[str, str]:
    values = dotenv_values(ENV_PATH)
    project_env: dict[str, str] = {}
    for key, value in values.items():
        if value is None:
            continue
        project_env[key] = value
    return project_env


def require(env: dict[str, str], key: str) -> str:
    value = env.get(key, "").strip()
    if not value:
        raise DeployError(f"Missing required setting: {key}")
    return value


def run_git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def normalize_repo_url(repo_url: str) -> str:
    url = repo_url.strip()
    if url.startswith("git@") and ":" in url:
        host_part, path_part = url.split(":", 1)
        host = host_part.split("@", 1)[1]
        return f"https://{host}/{path_part}"
    return url


def infer_repo_url(env: dict[str, str], cli_value: str | None) -> str:
    if cli_value:
        return normalize_repo_url(cli_value)
    if env.get("PORTAINER_REPO_URL"):
        return normalize_repo_url(env["PORTAINER_REPO_URL"])
    return normalize_repo_url(run_git("remote", "get-url", "origin"))


def infer_branch(env: dict[str, str], cli_value: str | None) -> str:
    if cli_value:
        return cli_value.strip()
    if env.get("PORTAINER_REPO_BRANCH"):
        return env["PORTAINER_REPO_BRANCH"].strip()
    branch = run_git("branch", "--show-current")
    if not branch:
        raise DeployError("Unable to determine current git branch")
    return branch


def infer_stack_name(env: dict[str, str], cli_value: str | None) -> str:
    if cli_value:
        return cli_value.strip()
    if env.get("PORTAINER_STACK_NAME"):
        return env["PORTAINER_STACK_NAME"].strip()
    return ROOT.name


def infer_compose_file(env: dict[str, str], cli_value: str | None) -> str:
    if cli_value:
        return cli_value.strip()
    if env.get("PORTAINER_COMPOSE_FILE"):
        return env["PORTAINER_COMPOSE_FILE"].strip()
    return DEFAULT_COMPOSE_FILE


def load_compose_file(compose_file: str) -> str:
    compose_path = ROOT / compose_file
    if not compose_path.exists():
        raise DeployError(f"Compose file not found: {compose_path}")
    return compose_path.read_text(encoding="utf-8")


class PortainerClient:
    def __init__(self, *, base_url: str, api_key: str, timeout: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={
                "X-API-Key": api_key,
                "Accept": "application/json",
            },
        )

    def close(self) -> None:
        self.client.close()

    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        response = self.client.request(method, path, **kwargs)
        if response.is_success:
            return response
        detail = self._response_detail(response)
        raise PortainerApiError(method, path, response.status_code, detail)

    @staticmethod
    def _response_detail(response: httpx.Response) -> str:
        try:
            payload = response.json()
        except Exception:
            return response.text.strip()
        if isinstance(payload, dict):
            if isinstance(payload.get("message"), str):
                return payload["message"]
            if isinstance(payload.get("details"), str):
                return payload["details"]
            if isinstance(payload.get("err"), str):
                return payload["err"]
        return str(payload)

    def list_endpoints(self) -> list[dict[str, Any]]:
        return self.request("GET", "/api/endpoints").json()

    def list_stacks(self) -> list[dict[str, Any]]:
        return self.request("GET", "/api/stacks").json()

    def create_repository_stack(
        self,
        *,
        endpoint_id: int,
        stack_name: str,
        repo_url: str,
        branch: str,
        compose_file: str,
        env_vars: list[dict[str, str]],
    ) -> dict[str, Any]:
        payload = {
            "Name": stack_name,
            "RepositoryURL": repo_url,
            "RepositoryReferenceName": branch,
            "RepositoryAuthentication": False,
            "ComposeFile": compose_file,
            "Env": env_vars,
        }
        errors: list[str] = []
        candidate_paths = [
            f"/api/stacks?type=2&method=repository&endpointId={endpoint_id}",
            f"/api/stacks/create/standalone/repository?endpointId={endpoint_id}",
        ]
        for path in candidate_paths:
            try:
                return self.request("POST", path, json=payload).json()
            except PortainerApiError as exc:
                if exc.status_code == 405:
                    errors.append(f"{path}: {exc.status_code}")
                    continue
                raise
        raise DeployError(
            "Portainer did not accept any repository stack create endpoint: " + ", ".join(errors)
        )

    def create_standalone_string_stack(
        self,
        *,
        endpoint_id: int,
        stack_name: str,
        stack_file_content: str,
        env_vars: list[dict[str, str]],
    ) -> dict[str, Any]:
        payload = {
            "Name": stack_name,
            "StackFileContent": stack_file_content,
            "Env": env_vars,
            "FromAppTemplate": False,
        }
        errors: list[str] = []
        candidate_paths = [
            f"/api/stacks?type=2&method=string&endpointId={endpoint_id}",
            f"/api/stacks/create/standalone/string?endpointId={endpoint_id}",
        ]
        for path in candidate_paths:
            try:
                return self.request("POST", path, json=payload).json()
            except PortainerApiError as exc:
                if exc.status_code == 405:
                    errors.append(f"{path}: {exc.status_code}")
                    continue
                raise
        raise DeployError(
            "Portainer did not accept any standalone string stack create endpoint: " + ", ".join(errors)
        )

    def redeploy_git_stack(self, *, stack_id: int, endpoint_id: int) -> dict[str, Any]:
        return self.request(
            "POST",
            f"/api/stacks/{stack_id}/git/redeploy?endpointId={endpoint_id}",
        ).json()

    def delete_stack(self, *, stack_id: int, endpoint_id: int) -> None:
        self.request("DELETE", f"/api/stacks/{stack_id}?endpointId={endpoint_id}")


def choose_endpoint(
    endpoints: list[dict[str, Any]],
    *,
    env: dict[str, str],
    cli_endpoint_id: int | None,
    cli_endpoint_name: str | None,
) -> dict[str, Any]:
    if not endpoints:
        raise DeployError("No Portainer endpoints are available")
    if cli_endpoint_id is not None:
        for endpoint in endpoints:
            if int(endpoint.get("Id", -1)) == cli_endpoint_id:
                return endpoint
        raise DeployError(f"No Portainer endpoint found with id {cli_endpoint_id}")

    desired_name = cli_endpoint_name or env.get("PORTAINER_ENDPOINT_NAME", "").strip()
    if desired_name:
        for endpoint in endpoints:
            if str(endpoint.get("Name", "")).strip().lower() == desired_name.lower():
                return endpoint
        raise DeployError(f"No Portainer endpoint found with name {desired_name!r}")

    env_endpoint_id = env.get("PORTAINER_ENDPOINT_ID", "").strip()
    if env_endpoint_id:
        try:
            parsed_id = int(env_endpoint_id)
        except ValueError as exc:
            raise DeployError("PORTAINER_ENDPOINT_ID must be an integer") from exc
        return choose_endpoint(endpoints, env=env, cli_endpoint_id=parsed_id, cli_endpoint_name=None)

    if len(endpoints) == 1:
        return endpoints[0]

    for endpoint in endpoints:
        name = str(endpoint.get("Name", "")).strip().lower()
        if name in {"local", "primary", "docker", "docker-standalone"}:
            return endpoint

    raise DeployError(
        "Multiple Portainer endpoints detected. Set PORTAINER_ENDPOINT_ID or PORTAINER_ENDPOINT_NAME, or pass --endpoint-id/--endpoint-name."
    )


def build_stack_env(env: dict[str, str]) -> list[dict[str, str]]:
    stack_env: list[dict[str, str]] = []
    for key in sorted(env):
        if key.startswith("PORTAINER_"):
            continue
        value = env[key]
        stack_env.append({"name": key, "value": value})
    return stack_env


def find_stack(stacks: list[dict[str, Any]], *, stack_name: str, endpoint_id: int) -> dict[str, Any] | None:
    for stack in stacks:
        name = str(stack.get("Name", "")).strip()
        stack_endpoint_id = stack.get("EndpointId", stack.get("EndpointID"))
        if name == stack_name and (stack_endpoint_id is None or int(stack_endpoint_id) == endpoint_id):
            return stack
    return None


def main() -> int:
    args = parse_args()
    env = load_environment()
    project_env = load_project_env_values()

    portainer_url = require(env, "PORTAINER_URL")
    portainer_token = require(env, "PORTAINER_ACCESS_TOKEN")
    repo_url = infer_repo_url(env, args.repo_url)
    branch = infer_branch(env, args.branch)
    stack_name = infer_stack_name(env, args.stack_name)
    compose_file = infer_compose_file(env, args.compose_file)
    compose_content = load_compose_file(compose_file)
    env_vars = build_stack_env(project_env)

    client = PortainerClient(base_url=portainer_url, api_key=portainer_token, timeout=args.timeout)
    try:
        endpoints = client.list_endpoints()

        if args.list_endpoints:
            for endpoint in endpoints:
                endpoint_id = endpoint.get("Id")
                name = endpoint.get("Name", "")
                endpoint_type = endpoint.get("Type", "")
                url = endpoint.get("URL", "")
                print(f"{endpoint_id}\t{name}\t{endpoint_type}\t{url}")
            return 0

        endpoint = choose_endpoint(
            endpoints,
            env=env,
            cli_endpoint_id=args.endpoint_id,
            cli_endpoint_name=args.endpoint_name,
        )
        endpoint_id = int(endpoint["Id"])
        existing_stack = find_stack(client.list_stacks(), stack_name=stack_name, endpoint_id=endpoint_id)

        if existing_stack and not args.replace:
            stack_id = int(existing_stack["Id"])
            response = client.redeploy_git_stack(stack_id=stack_id, endpoint_id=endpoint_id)
            print(f"Redeployed existing stack '{stack_name}' on endpoint {endpoint_id}.")
            print(response)
            return 0

        if existing_stack and args.replace:
            stack_id = int(existing_stack["Id"])
            client.delete_stack(stack_id=stack_id, endpoint_id=endpoint_id)
            print(f"Deleted existing stack '{stack_name}' on endpoint {endpoint_id}.")

        response = client.create_repository_stack(
            endpoint_id=endpoint_id,
            stack_name=stack_name,
            repo_url=repo_url,
            branch=branch,
            compose_file=compose_file,
            env_vars=env_vars,
        )
        print(f"Deployed stack '{stack_name}' from {repo_url}@{branch} to endpoint {endpoint_id}.")
        print(response)
        return 0
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else str(exc)
        print(stderr, file=sys.stderr)
        return 1
    except DeployError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
