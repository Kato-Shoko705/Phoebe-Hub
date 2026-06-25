import os
import json
from urllib.parse import quote

# 脚本放在仓库根目录，图片在 images/，数据输出到 data/memes.json
base_dir = os.path.dirname(os.path.abspath(__file__))
img_dir = os.path.join(base_dir, 'images')
output_path = os.path.join(base_dir, 'data', 'memes.json')

exts = {'.webp', '.jpg', '.jpeg', '.png', '.gif'}
files = []
for f in os.listdir(img_dir):
    ext = os.path.splitext(f)[1].lower()
    if ext in exts:
        files.append(f)

try:
    files.sort(key=lambda x: x.lower())
except Exception:
    files.sort()

def infer_category(filename):
    name = os.path.splitext(filename)[0].lower()
    cats = []
    if 'ai' in name:
        cats.append('ai')
    if filename.lower().endswith('.gif'):
        cats.append('gif')
    else:
        cats.append('static')
    cats.append('cute')
    return list(dict.fromkeys(cats))

memes = []
for idx, fname in enumerate(files, start=1):
    name_no_ext = os.path.splitext(fname)[0]
    ext = os.path.splitext(fname)[1].lower()
    encoded = quote(fname, safe='/')
    url = f'images/{encoded}'
    memes.append({
        'id': idx,
        'title': name_no_ext,
        'url': url,
        'category': infer_category(fname),
        'views': 0,
        'downloads': 0,
        'date': '2025-06-15',
        'isGif': ext == '.gif',
        'hot': 0,
        'tags': []
    })

result = {
    'memes': memes,
    'pending': [],
    'nextId': len(memes) + 1
}

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f'已生成 {len(memes)} 条表情包数据')
