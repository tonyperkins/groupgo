import sys

def test_voter_logistics_page_renders_debug(client, seeded_db, poll_with_sessions):
    from tests.conftest import _set_user_token
    token = _set_user_token(seeded_db, 2)
    client.cookies.set("token", token)

    response = client.get("/vote/logistics?view_all=true")
    with open('output.html', 'w', encoding='utf-8') as f:
        f.write(response.text)

