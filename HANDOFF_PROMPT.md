# Hillview Reservoir 铝框 Takeoff 工具 — 接手 Prompt

## 任务
改进 takeoff 工具的**几何自动分类逻辑**,让它在 `North.dxf` + `South Ex.dxf` 上算出的 IR501T 总数(逐 part 长度 + 根数)逼近基准 `IR501T.csv`。料件在 DXF 里**没有任何 position 标签**,必须靠几何(bbox 朝向/位置/尺寸)自动判别 Head/Jamb/Sill/Horizontal/Vertical/Transom Bar/Door Jamb/Door Jamb At Transom/Outside 90° Corner/Subsill。

## 文件(都在 `C:\Users\Ethan\Downloads\takeoff tool`)
- `Kawneer Takeoff Tool.html` + `app.js` — 浏览器工具,**正式版,改这个**
- `take_off.py` — CLI,同算法(可参考,非主改对象)
- `North.dxf` / `South Ex.dxf` — 要算的范围
- `part.xlsx` — 料表(含转角料号),`IR501T.csv` — 基准(**只有总数,只含 IR501T 系统,无逐立面/逐 mark 真值**)

## 算法流程(app.js)
`parseRawDxfOpenings` → 收集 AF_ALUM PROFILE / AF-DOOR SUBFRAME / AF_X polyline + 炸开 INSERT → `clusterPolys(eps=20, union-find)` 空间聚类,每簇=1 elevation → `dxfDetectCuts` 按几何分类 → `buildReport` 按 part 的 roles 汇总,×1.2 废料 ÷ stock 取整。
**关键:两个独立池子,从不交叉** —— 横件(w>h)→ Head/Sill/Horizontal;竖件(h>w)→ Jamb/Vertical(中梃)/Corner/Door Jamb。

## 已完成 Phase 1(已写入 app.js)
1. 补转角料号(role `Outside 90° Corner`):128125 / 575T515 / 575T535 —— 之前缺料导致转角 −100% 全进 UNRESOLVED,现已正常出料。
2. 575T217 加 `stockInches:144`(12ft 进货),`buildReport` 已支持 per-part stockInches(`b.stockInches||STOCK_INCHES`)。
3. `PARTS_DB_VERSION` → `20260610`(强制刷新 seed)。

## 当前准确率(IR501T position,tool vs 基准)
| 位置 | tool | base | diff% | 状态 |
|---|---|---|---|---|
| Head | 8951 | 8834 | +1.3% | ✅ |
| Sill | 8627 | 8344 | +3.4% | ✅ |
| Vertical | 9050 | 9504 | −4.8% | ✅ |
| Jamb | 10004 | 7257 | **+37.8%** | ❌ |
| Horizontal | 16863 | 18904 | **−10.8%** | ❌ |
| Door Jamb At Transom | 91 | 558 | **−83.8%** | ❌ |
| Door Jamb | 864 | 1185 | **−27.1%** | ❌ |
| Outside 90° Corner | 356 | 291 | +22.4% | ⚠ 长度偏高 |
| Transom Bar | 324 | 286 | +13.3% | ⚠ |
| Subsill | 388 | 0 | — | ⚠ 基准不跟踪 |

## 待办
**Phase 2 — 门检测(收益最大)**:South Ex 整文件 `AF-DOOR SUBFRAME` 图层**只有 5 根** polyline,绝大多数门没画在该层 → 工具认不出门 → 门两侧竖框被当成普通 Jamb 计。这一处同时造成 **Jamb +38%** 和 **门框 −45~−84%**。先查门到底以什么几何/图层画的,再改 `dxfDetectCuts` 的门头匹配 + upper/lower 切分(注:旧 WS26 case 有个"门头底边到竖件顶端"差 3" 的未决问题,口径文字一致但 polyline 端点与视觉量法不符)。

**Phase 3 — 过度切分 + 转角长度(过拟合风险高,最后做)**:连续 storefront 被聚成多个 bay,相邻 bay 共用竖件两边各计一次 → Jamb 剩余超出 + Horizontal −11%(Head 仅 +1.3% 说明立面集合/宽度是对的,错在簇内分类与切分粒度)。转角检测 `width≥1.5×典型竖件宽` 时灵时不灵会"吃" Jamb,导致转角长度 +22%。决定 Subsill 388 丢弃还是归并。

**Mark 匹配几乎全废**:WS12–WS47 marks 在 DXF 里存在(44 个),但 64 簇只匹配上 1 个,其余默认 EL-*→ system 全默认 IR501T(恰好基准也只 IR501T 所以总数没爆,但无法分离 450 内装件、无法溯源)。marks 文本是干净的 'WS13',正则 `^(WS|WN)\d+$` 应能匹配,需查为何 parse 只认到 1 个(可能是 ATTRIB / MTEXT 格式 / 离 cluster 太远)。

## 用户硬规矩
- 每次改动 ≤10% token;大动作先问;八荣八耻:不瞎猜、不模糊执行、不臆想、不假装懂、不盲改。
- **只要总数对,不用管单面 elevation**;基准只有总数,改逻辑要防"为凑这一份数字而过拟合"。

## 验证方法(重要,别重写算法)
用 Node harness **直接调 app.js 同一份函数**,不重写:shim `global.localStorage/document/window/navigator` → 读 app.js 文本、在 `'function init()'` 处截断(去掉 DOM 接线)→ append `module.exports={parseRawDxfOpenings,buildReport,expandOpeningCuts,get state(){return state},set state(v){state=v}}` → require → 对 North/South 跑 `parseRawDxfOpenings`,`state.openings=[...]`,`buildReport()`,对照基准。
**坑**:Downloads 挂载 host→sandbox 同步滞后,bash 里读 app.js 尾部可能被截断;故 harness 在 `init()` 处切来规避,并把 harness 写在 `/tmp` 跑;改完文件用 Read 工具(host 端)确认完整。
