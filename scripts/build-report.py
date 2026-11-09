"""테스트 결과를 보고서 템플릿에 반영하고 인쇄용 HTML을 만듭니다."""
from pathlib import Path
import base64
import html
import json
import platform
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'


def load(name):
    return json.loads((DOCS / name).read_text())


stats = load('test-results.json')['stats']
assert stats['unexpected'] == 0 and stats['skipped'] == 0 and stats['expected'] > 0, '테스트 통과 후 생성하세요.'
api = load('api-evidence.json')
ime = load('ime-evidence.json')
package = json.loads((ROOT / 'package-lock.json').read_text())['packages']
node_version = subprocess.check_output(['node', '--version'], text=True).strip()
os_name = 'macOS' if platform.system() == 'Darwin' else platform.system()
environment = f"{os_name}, Node.js {node_version}, Express {package['node_modules/express']['version']}, Playwright {package['node_modules/@playwright/test']['version']}, Google Chrome"
values = {
    'ENVIRONMENT': environment,
    'TEST_COUNT': str(stats['expected']),
    'FAILED_COUNT': str(stats['unexpected']),
    'SKIPPED_COUNT': str(stats['skipped']),
    'IME_DELAY': f"{ime['delayMs']:.1f}",
    'TIME_ROWS': '\n'.join(f"| {r['path']} | {r['serverMs']} | {r['clientMs']} |" for r in api['timing']),
}
report = (DOCS / 'report-template.md').read_text()
for key, value in values.items():
    report = report.replace('{{' + key + '}}', value)
assert not re.search(r'\{\{.*?\}\}', report), '치환되지 않은 템플릿 항목이 있습니다.'
(DOCS / 'report.md').write_text(report)

STYLE = '''
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;max-width:1040px;margin:32px auto;color:#17243b;line-height:1.65;padding:0 20px}
h1{font-size:28px}h2{margin-top:32px;border-bottom:1px solid #bac8d8;padding-bottom:8px}h3{font-size:17px}
table{width:100%;border-collapse:collapse;font-size:12px;margin:14px 0}td,th{border:1px solid #d2dae5;padding:7px;vertical-align:top;text-align:left}thead{background:#edf3fa}
img{max-width:100%;max-height:225mm;object-fit:contain}figure{margin:24px 0;break-inside:avoid}figcaption{font-weight:700;margin-bottom:10px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eff4fa;padding:16px;font-size:13px}
@page{size:A4;margin:14mm}
@media print{body{margin:0;padding:0;font-size:11px}h1{font-size:22px}h2{font-size:17px}h1,h2,h3{break-after:avoid}h2:has(+figure){break-before:page}h2+figure{break-before:auto}table{font-size:9px}td,th{padding:5px}thead{display:table-header-group}figure{break-before:page}tr{break-inside:avoid}}
'''


def inline(text):
    text = html.escape(text)
    text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'`(.*?)`', r'<code>\1</code>', text)


def document(title, body):
    return f'<!doctype html><html lang="ko"><meta charset="utf-8"><title>{title}</title><style>{STYLE}</style><body>{body}</body></html>'


# 이 템플릿에서 쓰는 제목·문단·표·이미지·인라인 코드만 변환합니다.
parts = []
in_table = False
for line in report.splitlines():
    if line.startswith('|'):
        if re.match(r'^\|[ :\-|]+$', line):
            continue
        cells = [inline(c.strip()) for c in line.strip('|').split('|')]
        if not in_table:
            parts.append('<table><thead><tr>' + ''.join(f'<th>{c}</th>' for c in cells) + '</tr></thead><tbody>')
            in_table = True
        else:
            parts.append('<tr>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>')
        continue
    if in_table:
        parts.append('</tbody></table>')
        in_table = False
    if not line.strip():
        continue
    image = re.match(r'!\[(.*?)\]\((.*?)\)', line)
    if image:
        label, path = image.groups()
        data = base64.b64encode((DOCS / path).read_bytes()).decode()
        parts.append(f'<figure><figcaption>{html.escape(label)}</figcaption><img src="data:image/png;base64,{data}"></figure>')
        continue
    heading = re.match(r'^(#{1,3}) (.*)', line)
    if heading:
        level = len(heading[1])
        parts.append(f'<h{level}>{inline(heading[2])}</h{level}>')
    else:
        parts.append(f'<p>{inline(line)}</p>')
(DOCS / 'report.html').write_text(document('게시판 개선 실습 보고서', ''.join(parts)))

# 화면 캡처만으로 드러나지 않는 요청 이벤트의 실제 수집 결과를 정리합니다.
debounce = load('debounce-evidence.json')
cancel = load('cancel-evidence.json')
cursor = load('cursor-evidence.json')
rows = [
    ('최종 자동 테스트', f"통과 {stats['expected']} / 실패 {stats['unexpected']} / 건너뜀 {stats['skipped']}"),
    ('50ms 간격 타이핑', f"요청 {debounce['typingRequests']}회"),
    ('입력 직후 조회 버튼', f"요청 {debounce['manualSearchRequests']}회"),
    ('한글 조합 중 / 완료 후', f"{ime['compositionRequests']}회 / {ime['completedRequests']}회, {ime['delayMs']:.1f}ms 후"),
    ('지연 응답 취소', f"{cancel['delayedResponseMs']}ms 지연, " + cancel['failed'][0]['error']['errorText']),
    ('최종 검색어', cancel['finalSearch']),
    ('미처리 JavaScript 오류', str(len(cancel['errors'])) + '개'),
]
body = '<h1>게시판 테스트 결과 요약</h1><p>2026-11-08 · 로컬 Chrome 자동 테스트에서 수집한 기록 (DevTools 화면 아님)</p><table><thead><tr><th>검사</th><th>결과</th></tr></thead><tbody>'
body += ''.join(f'<tr><td>{html.escape(k)}</td><td>{html.escape(v)}</td></tr>' for k, v in rows)
body += '</tbody></table><h2>커서 전체 순회</h2><table><thead><tr><th>검색어</th><th>건수</th><th>요청 수</th><th>누락</th><th>중복</th></tr></thead><tbody>'
for item in cursor:
    cells = [item['search'] or '(없음)', item['count'], item['pages'], item['missing'], item['duplicates']]
    body += '<tr>' + ''.join(f'<td>{html.escape(str(c))}</td>' for c in cells) + '</tr>'
body += '</tbody></table><h2>취소 기록</h2><pre>' + html.escape('\n'.join(cancel['logs'])) + '</pre><p>원본 기록: test-results.json, debounce-evidence.json, cancel-evidence.json, cursor-evidence.json, ime-evidence.json</p>'
(DOCS / 'evidence.html').write_text(document('테스트 결과 요약', body))
print('보고서와 검증 요약 HTML 생성 완료')
