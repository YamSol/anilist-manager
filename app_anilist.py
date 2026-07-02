from flask import Flask, redirect, request, jsonify, url_for
import requests
import json
import webbrowser
import time
from threading import Timer

app = Flask(__name__)

CLIENT_ID = "44893"
CLIENT_SECRET = "5FYK4oYw7kXkkLp6zIqtB4dKwXA2rEtbmdYRKWb6"
REDIRECT_URI = "http://localhost:3000/callback"
API_URL = "https://graphql.anilist.co"

access_token = None

UPDATE_MUTATION = """
  mutation UpdateMediaList($mediaId: Int, $priority: Int) {
    SaveMediaListEntry(mediaId: $mediaId, priority: $priority) {
      id
      priority
      media { title { english romaji } }
    }
  }
"""

LIST_QUERY = """
query ($userId: Int) {
  MediaListCollection(userId: $userId, type: ANIME) {
    lists {
      name
      entries {
        mediaId
        priority
        media { title { english romaji } }
      }
    }
  }
}
"""

def anilist_post(query, variables=None):
    return requests.post(API_URL, headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {access_token}'
    }, json={'query': query, 'variables': variables or {}}).json()

def get_user_id():
    resp = anilist_post("query { Viewer { id } }")
    return resp['data']['Viewer']['id']

@app.route('/')
def index():
    if access_token:
        return redirect(url_for('list_anime'))
    auth_url = (
        f"https://anilist.co/api/v2/oauth/authorize"
        f"?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&response_type=code"
    )
    return redirect(auth_url)

@app.route('/callback')
def callback():
    global access_token
    code = request.args.get('code')
    if not code:
        return "❌ Código não recebido", 400

    resp = requests.post('https://anilist.co/api/v2/oauth/token', json={
        'grant_type': 'authorization_code',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'redirect_uri': REDIRECT_URI,
        'code': code
    }).json()

    if 'access_token' not in resp:
        return f"❌ Erro ao obter token: {resp}", 400

    access_token = resp['access_token']
    return redirect(url_for('list_anime'))

@app.route('/list')
def list_anime():
    if not access_token:
        return redirect(url_for('index'))

    user_id = get_user_id()
    data = anilist_post(LIST_QUERY, {'userId': user_id})

    seen = {}
    for lst in data['data']['MediaListCollection']['lists']:
        for e in lst['entries']:
            mid = e['mediaId']
            title = e['media']['title']['english'] or e['media']['title']['romaji']
            if mid in seen:
                seen[mid]['lists'].append(lst['name'])
            else:
                seen[mid] = {
                    'id': mid,
                    'title': title,
                    'priority': e['priority'],
                    'lists': [lst['name']],
                }
    entries = list(seen.values())

    entries.sort(key=lambda x: (-x['priority'], x['title']))

    colors = ['#555', '#3a6bc7', '#2a9d4e', '#d4a017', '#d4601a', '#c0392b']
    labels = ['0', '1', '2', '3', '4', '5']

    rows = ''
    for e in entries:
        cur = e['priority']
        btns = ''
        for v in range(1, 6):
            active = 'active' if v == cur else ''
            btns += (
                f'<button class="prio-btn {active}" '
                f'data-id="{e["id"]}" data-val="{v}" '
                f'style="--c:{colors[v]}">{v}</button>'
            )
        zero_active = 'active' if cur == 0 else ''
        zero_btn = (
            f'<button class="prio-btn zero {zero_active}" '
            f'data-id="{e["id"]}" data-val="0" '
            f'style="--c:{colors[0]}">0</button>'
        )
        badge_color = colors[cur] if cur <= 5 else colors[0]
        list_label = ', '.join(e['lists'])
        rows += (
            f'<tr id="row-{e["id"]}">'
            f'<td class="title-cell">{e["title"]}</td>'
            f'<td><span class="list-tag">{list_label}</span></td>'
            f'<td><span class="cur-badge" style="background:{badge_color}">{labels[cur] if cur <= 5 else cur}</span></td>'
            f'<td class="btn-cell">{zero_btn}{btns}</td>'
            f'<td class="status-cell" id="status-{e["id"]}"></td>'
            f'</tr>'
        )

    html = f"""<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>AniList Priority Manager</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3; padding: 24px; }}
  h1 {{ font-size: 1.4rem; margin-bottom: 4px; }}
  .sub {{ color: #8b949e; font-size: .85rem; margin-bottom: 20px; }}
  .search-wrap {{ margin-bottom: 16px; }}
  #search {{ background: #161b22; border: 1px solid #30363d; color: #e6edf3;
             padding: 8px 12px; border-radius: 6px; width: 320px; font-size: .9rem; }}
  table {{ width: 100%; border-collapse: collapse; font-size: .88rem; }}
  th {{ text-align: left; padding: 8px 10px; background: #161b22;
        border-bottom: 1px solid #30363d; color: #8b949e; font-weight: 500; }}
  tr:hover td {{ background: #161b22; }}
  td {{ padding: 6px 10px; border-bottom: 1px solid #21262d; vertical-align: middle; }}
  .title-cell {{ max-width: 340px; }}
  .list-tag {{ font-size: .75rem; color: #8b949e; background: #21262d;
               padding: 2px 7px; border-radius: 10px; white-space: nowrap; }}
  .cur-badge {{ display: inline-block; width: 26px; height: 26px; border-radius: 50%;
                line-height: 26px; text-align: center; font-weight: 700; font-size: .85rem; color: #fff; }}
  .btn-cell {{ white-space: nowrap; }}
  .prio-btn {{ border: 2px solid var(--c); background: transparent; color: var(--c);
               width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
               font-weight: 700; font-size: .8rem; margin: 0 2px;
               transition: background .15s, color .15s; }}
  .prio-btn:hover {{ background: var(--c); color: #fff; }}
  .prio-btn.active {{ background: var(--c); color: #fff; }}
  .prio-btn.zero {{ border-style: dashed; }}
  .status-cell {{ width: 60px; font-size: .8rem; }}
  .ok {{ color: #2a9d4e; }}
  .err {{ color: #c0392b; }}
  .spin {{ color: #8b949e; }}
</style>
</head>
<body>
<h1>AniList Priority Manager</h1>
<p class="sub">{len(entries)} animes — clique nos botões pra atualizar na hora</p>
<div class="search-wrap">
  <input id="search" placeholder="Filtrar por nome..." oninput="filter(this.value)">
</div>
<table>
  <thead><tr>
    <th>Nome</th><th>Lista</th><th>Atual</th><th>Nova prioridade</th><th></th>
  </tr></thead>
  <tbody id="tbody">{rows}</tbody>
</table>

<script>
const COLORS = ['#555','#3a6bc7','#2a9d4e','#d4a017','#d4601a','#c0392b'];

document.getElementById('tbody').addEventListener('click', async e => {{
  const btn = e.target.closest('.prio-btn');
  if (!btn) return;
  const id = +btn.dataset.id;
  const val = +btn.dataset.val;
  const status = document.getElementById('status-' + id);
  const row = document.getElementById('row-' + id);

  status.textContent = '⏳';
  status.className = 'status-cell spin';

  try {{
    const resp = await fetch('/set/' + id + '/' + val, {{method: 'POST'}});
    const json = await resp.json();
    if (json.ok) {{
      row.querySelectorAll('.prio-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const badge = row.querySelector('.cur-badge');
      badge.textContent = val;
      badge.style.background = COLORS[val] || COLORS[0];
      status.textContent = '✓';
      status.className = 'status-cell ok';
    }} else {{
      status.textContent = '✗';
      status.className = 'status-cell err';
    }}
  }} catch {{
    status.textContent = '✗';
    status.className = 'status-cell err';
  }}

  setTimeout(() => {{ status.textContent = ''; }}, 2000);
}});

function filter(q) {{
  q = q.toLowerCase();
  document.querySelectorAll('#tbody tr').forEach(tr => {{
    const name = tr.querySelector('.title-cell').textContent.toLowerCase();
    tr.style.display = name.includes(q) ? '' : 'none';
  }});
}}
</script>
</body>
</html>"""
    return html

@app.route('/set/<int:media_id>/<int:priority>', methods=['POST'])
def set_priority(media_id, priority):
    if not access_token:
        return jsonify({'ok': False, 'error': 'not authorized'}), 401

    resp = anilist_post(UPDATE_MUTATION, {'mediaId': media_id, 'priority': priority})
    if 'errors' in resp:
        return jsonify({'ok': False, 'error': resp['errors'][0]['message']})
    return jsonify({'ok': True})

@app.route('/check')
def check_list():
    if not access_token:
        return redirect(url_for('index'))

    user_id = get_user_id()
    data = anilist_post(LIST_QUERY, {'userId': user_id})

    entries = {}
    for lst in data['data']['MediaListCollection']['lists']:
        for e in lst['entries']:
            entries[e['mediaId']] = {
                'priority': e['priority'],
                'title': e['media']['title']['english'] or e['media']['title']['romaji']
            }

    try:
        with open('out.json', 'r', encoding='utf-8') as f:
            expected = json.load(f)
    except FileNotFoundError:
        expected = []

    html = "<h1>Verificação de Priorities</h1>"
    html += "<p><a href='/list'>← Voltar pro editor</a></p>"
    html += "<table border='1' cellpadding='6'><tr><th>Nome</th><th>Esperado</th><th>Atual</th><th></th></tr>"
    for item in expected:
        cur = entries.get(item['id'], {})
        cur_p = cur.get('priority', 'N/A')
        ok = "✅" if cur_p == item['priority'] else "❌"
        html += f"<tr><td>{item['name']}</td><td>{item['priority']}</td><td>{cur_p}</td><td>{ok}</td></tr>"
    html += "</table>"

    zeros = [(mid, e) for mid, e in entries.items() if e['priority'] == 0]
    html += f"<h2>Com Priority = 0 ({len(zeros)})</h2><ul>"
    for mid, e in zeros:
        html += f"<li>{e['title']} (ID: {mid})</li>"
    html += "</ul>"
    return html

def open_browser():
    time.sleep(1)
    webbrowser.open('http://localhost:3000/')

if __name__ == '__main__':
    print("🚀 AniList Priority Manager — http://localhost:3000/")
    Timer(1, open_browser).start()
    app.run(host='localhost', port=3000, debug=False)
