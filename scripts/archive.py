from pathlib import Path
import zipfile,hashlib,json
root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text(encoding='utf-8-sig'))['version']
release=root/'release'/('v'+version)/'XiaodaiGrid-win32-x64'
if not (release/'XiaodaiGrid.exe').is_file():raise RuntimeError('请先生成桌面发布目录')
(release/'验证记录.md').write_bytes((root/'验证记录.md').read_bytes())
archive=root/'release'/f'XiaodaiGrid-v{version}-Windows-x64.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for file in sorted(release.rglob('*')):
        if file.is_file():z.write(file,Path('小呆网格')/file.relative_to(release))
with zipfile.ZipFile(archive) as z:
    bad=z.testzip()
    if bad is not None:raise RuntimeError(f'压缩包校验失败: {bad}')
sha=hashlib.sha256(archive.read_bytes()).hexdigest()
(archive.parent/'SHA256SUMS.txt').write_text(f'{sha}  {archive.name}\n',encoding='utf-8')
print(json.dumps({'version':version,'archive':str(archive),'sizeMB':round(archive.stat().st_size/1024/1024,1),'sha256':sha,'archiveIntegrity':'PASS'},ensure_ascii=True))
