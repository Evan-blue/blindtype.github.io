// timeline-data.js — 迭代时间线数据配置
// 新增条目只需在 TIMELINE_ENTRIES 数组末尾追加即可

const TIMELINE_ENTRIES = [
  // ═══════════════════════════════════════════
  // Phase 1: MVP 基础搭建  (05-18 ~ 05-21)
  // ═══════════════════════════════════════════
  {
    date: "2026-05-18 ~ 05-21",
    title: "Phase 1 — MVP 基础搭建",
    desc: "从零构建六键盲文输入工具的最小可用版本。完成盲文点位输入、拼音映射、语音播报、数字/英文输入等核心功能。",
    milestone: true,
    tags: ["MVP", "盲文点 Grid", "拼音映射表", "语音播报", "数字输入", "英文输入"],
    hiTags: ["MVP"],
  },
  {
    date: "05-18",
    title: "最小 Demo：六键盲文输入",
    desc: "离线网页端 demo，用小键盘 124578 表示六个小点的开关。0.5s 防抖后映射拼音或符号，确认输入后渲染到输出区。",
    tags: ["demo", "点位编码修正", "键位预设"],
  },
  {
    date: "05-19",
    title: "ARIA 无障碍 & 语义化 HTML",
    desc: "第一次语义化修复：dot-cell 改为 button 角色、输出区加 aria-live、面板加 role=\"dialog\"、所有交互元素可键盘访问。增加盲文键位预设。",
    tags: ["ARIA 无障碍", "语义化", "键盘导航"],
    hiTags: ["ARIA 无障碍"],
  },
  {
    date: "05-20",
    title: "拼音分组 & 输出区优化",
    desc: "实现拼音音节贪心拆分（splitPinyinChars），多个盲文方合成完整拼音。首次引入 pinyin-pro（CDN 方式），建立拼音↔汉字映射用于播报。",
    tags: ["分词合并", "pinyin-pro", "光标吸附"],
    hiTags: ["分词合并"],
  },
  {
    date: "05-21",
    title: "数字输入 & 上下文感知",
    desc: "同一 oneHot 编码在数字/拼音上下文中表示不同含义，自动检测上下文切换播报方式。增加光标移动防抖。",
    tags: ["数字上下文", "英文大小写", "光标防抖"],
  },

  // ═══════════════════════════════════════════
  // Phase 2: 功能扩展 & 性能优化  (05-23 ~ 05-25)
  // ═══════════════════════════════════════════
  {
    date: "2026-05-23 ~ 05-25",
    title: "Phase 2 — 功能扩展 & 性能优化",
    desc: "标点符号、分词渲染、分页加载等关键功能落地。同步进行无障碍全面审查与修复，为比赛提交做准备。",
    milestone: true,
    tags: ["分页渲染", "无障碍审查", "标点符号", "分词"],
    hiTags: ["分页渲染", "无障碍审查"],
  },
  {
    date: "05-23",
    title: "声母歧义 & 标点符号",
    desc: "解决 g/k/h 与 j/q/x 的韵母起头判断；标点符号盲文规范补全、组合盲文（双单元格标点）；声调省写规则初步。",
    tags: ["声母判断", "标点盲文", "组合盲文"],
  },
  {
    date: "05-24",
    title: "分词逻辑 & 句子渲染",
    desc: "Intl.Segmenter 分词后自动插入空方分隔语义块。大量句子输入实测 + bug 修复（eng 误判数号、you→iu 映射、韵母合并拦截）。",
    tags: ["Intl.Segmenter", "空方补全", "句子测试"],
    hiTags: ["Intl.Segmenter"],
  },
  {
    date: "05-25",
    title: "分页渲染 & 无障碍全面审查",
    desc: "大文件自动分页 + 前后页预渲染（requestIdleCallback）。比赛提交前最后一次大型核心优化：全面 ARIA 审查、颜色对比度达标、焦点陷阱、inert 属性。",
    tags: ["分页", "无障碍 2.0", "WCAG 对比度", "焦点陷阱"],
    hiTags: ["分页", "无障碍 2.0"],
  },

  // ═══════════════════════════════════════════
  // Phase 3: 教程系统 & ESM 架构迁移  (05-27 ~ 06-05)
  // ═══════════════════════════════════════════
  {
    date: "2026-05-27 ~ 06-05",
    title: "Phase 3 — 教程系统 & ESM 架构迁移",
    desc: "新手教程、欢迎页上线。经历三次 ESM 迁移尝试最终成功，代码从 19 个 script 标签合并为单入口模块。",
    milestone: true,
    tags: ["新手教程", "ESM 迁移", "打字输入模式", "声调省写"],
    hiTags: ["新手教程", "ESM 迁移"],
  },
  {
    date: "05-27",
    title: "欢迎页 & 新手教程",
    desc: "首次访问弹出欢迎遮罩，引导进入新手教程。教程通道与主通道语音队列完全独立（双队列架构），互不阻塞。",
    tags: ["欢迎页", "双队列语音", "教程系统"],
    hiTags: ["双队列语音"],
  },
  {
    date: "05-28 ~ 05-29",
    title: "打字输入模式 & 屎山审查",
    desc: "新增打字输入模式：中文、数字、英文混合输入自动识别。devPanel 功能完善。第一次屎山代码审查（confirmInput/inputOneHot 合并去重）。",
    tags: ["打字模式", "代码审查", "技术债务"],
  },
  {
    date: "05-31 ~ 06-01",
    title: "ESM 迁移（两次尝试）",
    desc: "第一次迁移因循环依赖失败。第二次逐步迁移：打破 3 个循环依赖、面板功能独立为独立文件、panelManager 工厂函数封装。",
    tags: ["ESM try1 fail", "循环依赖", "panelManager"],
    hiTags: ["ESM try1 fail"],
  },
  {
    date: "06-03 ~ 06-05",
    title: "ESM 全量迁移成功 & 声调省写",
    desc: "第三次 ESM 尝试终成功：19 个 script → 单一 importmap + init.js 入口。解决只读绑定问题（ESM 不可重赋值导入变量）。声调省写规则完整落地。",
    tags: ["ESM 成功", "声调省写", "只读绑定"],
    hiTags: ["ESM 成功"],
  },

  // ═══════════════════════════════════════════
  // Phase 4: 体验打磨 & 持续优化  (06-08 ~ 06-25)
  // ═══════════════════════════════════════════
  {
    date: "2026-06-08 ~ 06-25",
    title: "Phase 4 — 体验打磨 & 持续优化",
    desc: "视觉设计系统化、键盘 UI 重构、语音播报精细化控制。对照表 tooltip、教程打断恢复、测试体系建设等细节完善。",
    milestone: true,
    tags: ["设计体系", "语音优化", "测试", "UX 打磨"],
    hiTags: ["设计体系"],
  },
  {
    date: "06-08 ~ 06-09",
    title: "设计体系 & 键盘 UI 重构",
    desc: "CSS 设计 Token 变量体系建立（spacing/type/radius/z-index）。768px 响应式断点。dot-grid 凹陷视觉效果。键盘可视化面板 + 盲文键位拖拽换位。",
    tags: ["Design Tokens", "响应式", "键位拖拽"],
    hiTags: ["键位拖拽"],
  },
  {
    date: "06-14",
    title: "测试体系建设",
    desc: "引入 Vitest + jsdom 搭建测试框架。覆盖 utils-braille、brailleState、loadMappings、config 等模块，累计 100+ 测试用例。",
    tags: ["Vitest", "单元测试", "jsdom"],
    hiTags: ["Vitest"],
  },
  {
    date: "06-17",
    title: "播报状态可视化",
    desc: "devPanel 增加语音播报小圆点指示器，播报中绿点亮起，播完熄灭。通过 CustomEvent 与 SpeechSynthesis 事件联动。",
    tags: ["可视化", "CustomEvent", "UX"],
  },
  {
    date: "06-24",
    title: "朗读 & 教程打断恢复优化",
    desc: "speakText 打断教程时自动保存断点，播完后从断点恢复（resume_back 5 字符）。_activeChannel 标记防止 stop 误伤其他通道。",
    tags: ["打断恢复", "教程续播"],
    hiTags: ["打断恢复"],
  },
  {
    date: "06-25",
    title: "对照表 Tooltip & 播报优化",
    desc: "盲文对照表数字和英文字母记忆方式提示。拼音字母播报前自动转汉字（如 g→哥）。mapping panel tooltip 打断后不再恢复。删减无用的面板和 HTML 文件。",
    tags: ["tooltip", "拼音转汉字", "resumable 标记"],
    hiTags: ["拼音转汉字"],
  },
];
