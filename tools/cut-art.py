# 제미나이 그림(연두 배경) → 배경 지운 정사각 PNG (art/이름.png, 256px)
# 사용: python3 tools/cut-art.py art_src/fire1.png ...
# SAMEBOX=1 이면 여러 장을 같은 크기 기준으로 자름 (단계마다 조금씩 커지는 그림의 크기 차이를 살림, 보스용)
import sys, os
import numpy as np
from PIL import Image, ImageFilter
OUT = 256
SAME = os.environ.get('SAMEBOX') == '1'
union = None
results = []
for path in sys.argv[1:]:
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # 배경 색 추정: 네 모서리 근처 평균
    h, w = r.shape
    corners = np.concatenate([a[:40, :40].reshape(-1, 3), a[:40, -40:].reshape(-1, 3), a[-40:, :40].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    # 배경과의 색 거리 → 바깥 테두리에서 이어진 '배경 같은' 영역만 배경으로 (몸 안의 초록은 남김)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    near = dist < 70
    from scipy import ndimage
    lab, n = ndimage.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(border))
    # 경계는 부드럽게: 배경 영역 근처 2px에서 거리로 알파
    soft = np.clip((dist - 25) / 60, 0, 1)
    grow = ndimage.binary_dilation(bgmask, iterations=2)
    alpha = np.where(bgmask, 0.0, np.where(grow, soft, 1.0))
    # 가장자리 초록 번짐 제거 (반투명 경계에서 초록을 빼 줌)
    a2 = a.copy()
    edge = (alpha < 1) & (alpha > 0)
    a2[..., 1] = np.where(edge, np.minimum(g, (r + b) / 2 + 20), g)
    # 빛나는 장식(별·달 등) 주변에 섞인 연두 빛 제거: 배경에서 18px 안쪽 띠에서 초록 성분을 빼고 그만큼 투명하게 (풀 속성은 몸 색 보호로 제외)
    name0 = os.path.basename(path)
    if not (name0.startswith('grass') or name0.startswith('rainbow')): # 무지개 보스도 몸에 초록 면이 있어서 제외
        band = ndimage.binary_dilation(bgmask, iterations=18) & ~bgmask
        spill = np.clip(a2[..., 1] - np.maximum(r, b), 0, None)
        frac = np.clip(spill / max(1.0, bg[1] - max(bg[0], bg[2])), 0, 1)
        alpha = np.where(band, alpha * (1 - frac), alpha)
        a2[..., 1] = np.where(band, a2[..., 1] - spill, a2[..., 1])
    rgba = np.dstack([a2, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    # 몬스터만 남게 자르기 (작은 점·워터마크 무시: 알파 큰 덩어리 기준)
    m = alpha > 0.5
    ys, xs = np.where(m)
    # 오른쪽 아래 모서리 15% 구역(제미나이 표시)은 무시
    keep = ~((xs > w * 0.82) & (ys > h * 0.82))
    ys, xs = ys[keep], xs[keep]
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    rgba[:, :, 3][(np.arange(h)[:, None] > h * 0.82) & (np.arange(w)[None, :] > w * 0.82)] = 0
    results.append((path, rgba, (x0, x1, y0, y1), w, h))
    union = (x0, x1, y0, y1) if union is None else (min(union[0], x0), max(union[1], x1), min(union[2], y0), max(union[3], y1))
for path, rgba, bb, w, h in results:
    x0, x1, y0, y1 = union if SAME else bb
    img = Image.fromarray(rgba, 'RGBA')
    side = int(max(x1 - x0, y1 - y0) * 1.08)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    crop = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    crop.paste(img.crop((max(0, box[0]), max(0, box[1]), min(w, box[2]), min(h, box[3]))), (max(0, -box[0]), max(0, -box[1])))
    crop = crop.resize((OUT, OUT), Image.LANCZOS)
    name = os.path.splitext(os.path.basename(path))[0]
    crop.save(os.path.join('art', name + '.png'), optimize=True)
    print(name, 'ok', crop.size)
