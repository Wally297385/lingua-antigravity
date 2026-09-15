# 角色扮演持久化状态契约 (State Schema Specification)

本文档为 `@skill(roleplay)` 的核心参考资料，定义存储在 `task/roleplay/state.json` 中的唯一分支增量数据结构。

---

## 1. 核心设计原则

- **唯一真实性**：只用 `task/roleplay/state.json` 保存无法从工程设定或最近上下文低成本重建的分支事实，不设立其他旁路缓存或存档槽。
- **不可见性**：状态文件为 Agent 内部推演依据，严禁向用户直接打印 JSON 结构或工具调用内部细节。
- **增量压缩**：每回合演进后仅保存核心锚点与当前关键增量，保持文件紧凑。

---

## 2. 顶层 7 大对象 Schema 详解

```json
{
  "player": {
    "identity": "角色全名与身份",
    "presence": "当前角色的外观、体态、可见特征与公开标签",
    "capabilities": "已建立的能力边界与技能",
    "knowledge": "当前角色确切知晓的信息与未解之谜"
  },
  "narration": {
    "language": "zh",
    "perspective": "第三人称限知视角 (以玩家角色为中心)",
    "target_length": "约 1500~3000 字",
    "style_notes": "保留原作风格、避免剧透与过度自白"
  },
  "scene": {
    "location": "当前具体场景地点",
    "time": "具体时点/时间跨度",
    "present_actors": ["在场人物A", "在场人物B"],
    "positions": "在场人物相对位置与朝向",
    "environment_pressures": "即刻的环境危机、限制或社交压力",
    "key_items": "现场可交互或被注意到的关键物件"
  },
  "actors": {
    "人物名": {
      "presence": "外显锚点（神态/服饰/体态）",
      "voice": "语言口吻、特定口癖、称呼习惯",
      "behavior": "行为规律与核心顾忌",
      "current": "本回合内心的即时认知、目标与对玩家的态度"
    }
  },
  "relations": {
    "玩家->人物A": "表面同盟、暗含防备",
    "人物A->玩家": "依赖但有所隐瞒"
  },
  "world_threads": [
    {
      "thread_id": "faction_movement",
      "summary": "后台势力的调度进度与预计爆发时机",
      "status": "active"
    }
  ],
  "branch_facts": [
    "第1回合：玩家拒绝了交出钥匙的要求",
    "第2回合：秘密会谈被外部守卫察觉，警戒等级提升"
  ]
}
```

---

## 3. 状态更新与迁移守则

1. **每回合更新**：在产生实质性剧情推进后，更新 `scene`（位置/人物/压力）与 `branch_facts`。
2. **关系与后台线程演进**：当玩家的行动或世界反馈改变了 NPC 的态度或推动了后台事件时，同步更新 `relations` 和 `world_threads`。
3. **一致性回溯**：在生成新回合正文前，Agent 必须读取该状态，严格校验与前置事实的因果连续性。
