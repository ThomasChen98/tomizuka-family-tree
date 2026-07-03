#!/usr/bin/env python3
"""Ingest survey-submitted photos (the photo_url column) into photos/.

Policy: photos publish automatically; a human reviews photos.html weekly and
blocks bad ones by adding the person-id to photos/blocklist.txt (one id per
line). Blocked ids get their file deleted and are never re-ingested.

Usage:
    python3 scripts/ingest_photos.py [responses.csv ...]

Run from the repo root, after build_data.py (needs data/tree.js for the
name -> id mapping) and before a second build_data.py pass (which refreshes
photo paths in the rendered data). Requires Pillow.
"""
import csv
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import norm_name  # the same matcher the survey merge uses

MANIFEST = 'photos/manifest.json'
BLOCKLIST = 'photos/blocklist.txt'
MAX_BYTES = 15_000_000


def load_tree():
    s = open('data/tree.js').read()
    return json.loads(re.sub(r'^.*?window\.TREE_DATA = ', '', s, flags=re.S).rstrip(';\n'))


def name_index(tree):
    idx = {}
    stack = list(tree.get('children', []))
    while stack:
        n = stack.pop()
        idx.setdefault(norm_name(n['name']), n['id'])
        stack.extend(n.get('children', []))
    return idx


def load_blocklist():
    ids = set()
    if os.path.exists(BLOCKLIST):
        for line in open(BLOCKLIST):
            line = line.strip()
            if line and not line.startswith('#'):
                ids.add(line)
    return ids


def main():
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 60_000_000

    idx = name_index(load_tree())
    manifest = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    blocked = load_blocklist()

    for pid in sorted(blocked):
        p = f'photos/{pid}.jpg'
        if os.path.exists(p):
            os.remove(p)
            print(f'blocklist: removed {p}')
        manifest.pop(pid, None)

    for path in sys.argv[1:]:
        for r in csv.DictReader(open(path)):
            url = (r.get('photo_url') or '').strip()
            name = (r.get('name') or '').strip()
            if not name or not url.lower().startswith('http'):
                continue
            pid = idx.get(norm_name(name))
            if pid is None or pid in blocked:
                continue
            dst = f'photos/{pid}.jpg'
            if (manifest.get(pid) or {}).get('source') == url and os.path.exists(dst):
                continue  # this exact photo is already in
            tmp = f'/tmp/ingest_{pid}'
            rc = subprocess.run(
                ['curl', '-sL', '--max-time', '60',
                 '--max-filesize', str(MAX_BYTES), '-o', tmp, url],
            ).returncode
            if rc != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 2000:
                print(f'skip {pid}: download failed ({url})')
                continue
            try:
                im = Image.open(tmp)
                im.load()
                if im.width < 80 or im.height < 80:
                    print(f'skip {pid}: too small {im.size}')
                    continue
                im = im.convert('RGB')
                im.thumbnail((240, 240))
                im.save(dst, 'JPEG', quality=88)
            except Exception as e:
                print(f'skip {pid}: not a usable image ({e})')
                continue
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)
            manifest[pid] = {
                'source': url,
                'confidence': 'self-submitted (survey)',
                'ingested': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            }
            print(f'ingested {dst} <- {url}')

    json.dump(manifest, open(MANIFEST, 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
