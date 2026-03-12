import sys
with open('tests/test_route_smoke.py', 'r') as f:
    content = f.read()

content = content.replace('print("\\n=== HTML RESPONSE ===")', 'with open("smoke_debug.html", "w", encoding="utf-8") as f:\n            f.write(response.text)')

with open('tests/test_route_smoke.py', 'w') as f:
    f.write(content)
