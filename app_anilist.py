from flask import Flask, redirect, request, jsonify, url_for, session
import requests
import json
import webbrowser
import time
import os
import secrets
import html
from threading import Timer

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)

CLIENT_ID = os.environ.get("ANILIST_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("ANILIST_CLIENT_SECRET", "")
REDIRECT_URI = "http://localhost:3000/callback"
API_URL = "https://graphql.anilist.co"

if not CLIENT_ID or not CLIENT_SECRET:
    raise RuntimeError("Defina ANILIST_CLIENT_ID e ANILIST_CLIENT_SECRET nas variáveis de ambiente.")

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
    state = secrets.token_urlsafe(16)
    session['oauth_state'] = state
    auth_url = (
        f"https://anilist.co/api/v2/oauth/authorize"
        f"?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&response_type=code&state={state}"
    )
    return redirect(auth_url)

@app.route('/callback')
def callback():
    global access_token
    code = request.args.get('code')
    returned_state = request.args.get('state', '')
    expected_state = session.pop('oauth_state', None)

    if not code:
        return "❌ Código não recebido", 400
    if not expected_state or returned_state != expected_state:
        return "❌ State inválido (possível ataque CSRF)", 400

    resp = requests.post('https://anilist.co/api/v2/oauth/token', json={
        'grant_type': 'authorization_code',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'redirect_uri': REDIRECT_URI,
        'code': code
    }).json()

    if 'access_token' not in resp:
        return f"❌ Erro ao obter token: {html.escape(str(resp))}", 400

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

    entries = [
        {'id': e['id'], 'title': e['title'], 'priority': e['priority'], 'lists': ', '.join(e['lists'])}
        for e in seen.values()
    ]

    rows_json = json.dumps(entries).replace('</', '<\\/')

    html = f"""<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>AniList Priority Manager</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ag-grid-community@33.3.2/styles/ag-grid.css"
      integrity="sha384-im0Bf++qldcOWc99rZEHz7a7W7n1WwR2NDq7rrtYlNaClwaNZCAir+RUtiqj3S9H"
      crossorigin="anonymous">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ag-grid-community@33.3.2/styles/ag-theme-alpine.css"
      integrity="sha384-MohqEULWA+9H9ecqycKh9k2CpUoTlic+w4eJ2o5pW+4H1U49fMjGHqX1Q5AGlFPN"
      crossorigin="anonymous">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3;
          display: flex; flex-direction: column; height: 100vh; padding: 16px; gap: 12px; }}
  h1 {{ font-size: 1.3rem; flex-shrink: 0; }}
  .sub {{ color: #8b949e; font-size: .82rem; flex-shrink: 0; }}
  #grid {{ flex: 1; min-height: 0; }}

  .ag-theme-alpine {{
    --ag-background-color: #0d1117;
    --ag-foreground-color: #e6edf3;
    --ag-header-background-color: #161b22;
    --ag-header-foreground-color: #8b949e;
    --ag-odd-row-background-color: #0d1117;
    --ag-row-hover-color: #161b22;
    --ag-border-color: #30363d;
    --ag-input-focus-border-color: #388bfd;
    --ag-selected-row-background-color: #1c2a3a;
    --ag-range-selection-border-color: #388bfd;
    --ag-font-size: 13px;
    --ag-cell-horizontal-padding: 10px;
    --ag-filter-tool-panel-header-height: 28px;
  }}
  .ag-theme-alpine .ag-root-wrapper {{ border: 1px solid #30363d; border-radius: 6px; }}

  .prio-cell {{ display: flex; align-items: center; gap: 4px; }}
  .prio-btn {{
    border: 2px solid var(--c); background: transparent; color: var(--c);
    width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
    font-weight: 700; font-size: .78rem; line-height: 1;
    transition: background .12s, color .12s;
  }}
  .prio-btn:hover, .prio-btn.active {{ background: var(--c); color: #fff; }}
  .prio-btn.zero {{ border-style: dashed; }}
  .status {{ font-size: .8rem; margin-left: 4px; width: 16px; display: inline-block; }}
</style>
</head>
<body>
<h1>AniList Priority Manager</h1>
<p class="sub">{len(entries)} animes — sort e filtra por coluna, clica nos botões pra salvar</p>
<div id="grid" class="ag-theme-alpine"></div>

<script src="https://cdn.jsdelivr.net/npm/ag-grid-community@33.3.2/dist/ag-grid-community.min.js"
        integrity="sha384-e5dtcdU6W+6eGbKHSLjkBTaMThWX2E+jXV4KTlX+WmtwwBvVFBl8ohNejNV+PAHr"
        crossorigin="anonymous"></script>
<script>
const COLORS = ['#555','#3a6bc7','#2a9d4e','#d4a017','#d4601a','#c0392b'];
const ROWS = {rows_json};

function PrioCellRenderer() {{}}
PrioCellRenderer.prototype.init = function(params) {{
  this.eGui = document.createElement('div');
  this.eGui.className = 'prio-cell';
  this._params = params;
  this._cur = params.value;
  this._render();
}};
PrioCellRenderer.prototype._render = function() {{
  const cur = this._cur;
  let html = '';
  for (let v = 0; v <= 5; v++) {{
    const active = v === cur ? ' active' : '';
    const zero = v === 0 ? ' zero' : '';
    html += `<button class="prio-btn${{active}}${{zero}}" data-val="${{v}}"
      style="--c:${{COLORS[v] || COLORS[0]}}">${{v}}</button>`;
  }}
  html += `<span class="status" id="st-${{this._params.data.id}}"></span>`;
  this.eGui.innerHTML = html;
  this.eGui.addEventListener('click', e => {{
    const btn = e.target.closest('.prio-btn');
    if (!btn) return;
    this._set(+btn.dataset.val);
  }});
}};
PrioCellRenderer.prototype._set = async function(val) {{
  const id = this._params.data.id;
  const st = document.getElementById('st-' + id);
  if (st) st.textContent = '⏳';
  try {{
    const r = await fetch('/set/' + id + '/' + val, {{method: 'POST'}});
    const j = await r.json();
    if (j.ok) {{
      this._cur = val;
      this._params.node.setDataValue('priority', val);
      this._render();
      const st2 = document.getElementById('st-' + id);
      if (st2) {{ st2.textContent = '✓'; setTimeout(() => {{ st2.textContent = ''; }}, 1500); }}
    }} else {{
      if (st) {{ st.textContent = '✗'; setTimeout(() => {{ st.textContent = ''; }}, 1500); }}
    }}
  }} catch {{
    if (st) {{ st.textContent = '✗'; setTimeout(() => {{ st.textContent = ''; }}, 1500); }}
  }}
}};
PrioCellRenderer.prototype.getGui = function() {{ return this.eGui; }};
PrioCellRenderer.prototype.refresh = function(params) {{
  this._cur = params.value;
  this._render();
  return true;
}};

const colDefs = [
  {{
    field: 'title', headerName: 'Nome', flex: 3, minWidth: 180,
    filter: 'agTextColumnFilter', floatingFilter: true, sortable: true,
  }},
  {{
    field: 'lists', headerName: 'Lista(s)', flex: 2, minWidth: 120,
    filter: 'agTextColumnFilter', floatingFilter: true, sortable: true,
  }},
  {{
    field: 'priority', headerName: 'Prioridade', flex: 2, minWidth: 260,
    filter: 'agNumberColumnFilter', floatingFilter: true, sortable: true,
    cellRenderer: PrioCellRenderer,
    comparator: (a, b) => a - b,
  }},
];

const gridOptions = {{
  rowData: ROWS,
  columnDefs: colDefs,
  defaultColDef: {{
    resizable: true,
    suppressMovable: false,
  }},
  animateRows: true,
  pagination: false,
  rowHeight: 44,
  headerHeight: 40,
  floatingFiltersHeight: 36,
}};

agGrid.createGrid(document.getElementById('grid'), gridOptions);
</script>
</body>
</html>"""
    return html

@app.route('/set/<int:media_id>/<int:priority>', methods=['POST'])
def set_priority(media_id, priority):
    if not access_token:
        return jsonify({'ok': False, 'error': 'not authorized'}), 401

    origin = request.headers.get('Origin', '')
    if origin and not origin.startswith('http://localhost:'):
        return jsonify({'ok': False, 'error': 'forbidden'}), 403

    if not (0 <= priority <= 5):
        return jsonify({'ok': False, 'error': 'priority must be 0-5'}), 400

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

    out = "<h1>Verificação de Priorities</h1>"
    out += "<p><a href='/list'>← Voltar pro editor</a></p>"
    out += "<table border='1' cellpadding='6'><tr><th>Nome</th><th>Esperado</th><th>Atual</th><th></th></tr>"
    for item in expected:
        cur = entries.get(item['id'], {})
        cur_p = cur.get('priority', 'N/A')
        ok = "✅" if cur_p == item['priority'] else "❌"
        safe_name = html.escape(str(item['name']))
        out += f"<tr><td>{safe_name}</td><td>{item['priority']}</td><td>{cur_p}</td><td>{ok}</td></tr>"
    out += "</table>"

    zeros = [(mid, e) for mid, e in entries.items() if e['priority'] == 0]
    out += f"<h2>Com Priority = 0 ({len(zeros)})</h2><ul>"
    for mid, e in zeros:
        safe_title = html.escape(str(e['title']))
        out += f"<li>{safe_title} (ID: {mid})</li>"
    out += "</ul>"
    return out

def open_browser():
    time.sleep(1)
    webbrowser.open('http://localhost:3000/')

if __name__ == '__main__':
    print("🚀 AniList Priority Manager — http://localhost:3000/")
    Timer(1, open_browser).start()
    app.run(host='localhost', port=3000, debug=False)
