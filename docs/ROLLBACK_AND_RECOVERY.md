# 完美回滚与故障恢复手册 (Rollback & Recovery Manual)

为保障工程数据安全与系统的极端鲁棒性，`lingua-Antigravity` 设计了覆盖 **数据层、任务层、配置层与代码版本** 的全方位回滚与容灾保障体系。

---

## 1. 回滚体系全景架构 (Architecture)

```text
+-------------------------------------------------------------------------+
|                        Lingua-Antigravity 容灾体系                       |
+-------------------------------------------------------------------------+
  │
  ├─► [数据层] 双层 Staging 隔离 + 自动快照备份 (.backup/) + 原子 Apply 事务
  │
  ├─► [任务层] task_progress 显式状态重置 + task/** 状态目录自愈
  │
  ├─► [配置层] 插件热拔插 + 零残留卸载
  │
  └─► [版本层] Git 分阶段稳定 Checkpoint (Tag & Revert)
```

---

## 2. 数据层回滚机制 (Data Layer Rollback)

### ① Staging 隔离与零污染写入 (Staging Isolation)
- **只读基准**：所有原始数据（`items/entries.jsonl`, `glossary/entries.jsonl`, `project_meta.json` 等）在 `workspace_load` 与 `workspace_script` 执行期间严格保持**只读**。
- **覆盖层写入**：模型在沙箱中生成的任何拟修改，只能写入 `changes/items/updates.jsonl` 或 `scratch/` 临时目录中，**绝不直接触碰原文件**。
- **放弃修改**：如果用户未授权或模型出现偏差，只需重新调用 `workspace_load` 或放弃调用 `workspace_apply`，所有 Staging 修改即刻丢弃，数据 100% 保持原状。

### ② Apply 自动快照备份与秒级恢复 (Pre-Apply Snapshots)
在调用 `workspace_apply` 将变更真正写入数据文件前，MCP 服务端执行以下自动保护流程：

1. **自动生成时间戳备份**：
   ```text
   .backup/
   └── 2026-08-21T19-30-00-123Z/
       ├── items/entries.jsonl
       ├── glossary/entries.jsonl
       └── manifest.json          # 记录本次备份的文件清单与 SHA-256 哈希
   ```
2. **原子写入与校验**：
   - 依次校验并写入新数据。
   - 若中途发生任何文件 IO 错误、进程被中断或数据格式损坏，服务端立即触发**自动补偿回滚**，将 `.backup/` 中对应的原始文件秒级还原覆盖，保证项目数据的完整原子性。

### ③ 手动紧急数据恢复 SOP (Manual Recovery SOP)
若在极端异常情况下（如断电导致文件损坏），可按以下步骤手动恢复最近一次备份：

```bash
# 1. 查看最近的备份目录
ls -la .backup/

# 2. 从最近的时间戳目录复制还原
cp -r .backup/<latest_timestamp>/* ./

# 3. 清理残留的 changes 和 scratch
rm -rf changes/ scratch/
```

---

## 3. 任务与会话状态回滚 (Task & Session Recovery)

### ① Task Progress 状态重置
当长任务中断、异常停止或用户要求重新规划时：
- 调用 `task_progress` 的 `cancel` 操作：立即清空内存工作队列与未完成项，释放任务锁。
- 调用 `task_progress` 的 `read` 操作：重新读取当前基准状态，确保不会遗留死锁任务。

### ② Roleplay 分支状态回退
- 角色扮演状态存储在 `task/roleplay/state.json`。
- 若搭档要求回溯剧情（如“回到进城之前的时刻”）：
  - 模型根据工程原文、最近对话和搭档指定的时间点，直接重算并原子覆写 `task/roleplay/state.json`。
  - 不维护易发生脏数据的多版本回退栈，保证状态事实始终唯一自洽。

---

## 4. 插件与配置热拔插 (Plugin Hot-Unplug)

本套件采用标准的 Antigravity Plugin 规范开发，具备**对宿主环境零污染**特性：

### 临时停用 (Disable)
若需临时停用本套件，只需在 `~/.gemini/config/config.json` 中配置：
```json
{
  "plugins": {
    "lingua-antigravity": {
      "enabled": false
    }
  }
}
```
Antigravity 会立即卸载所有相关 Skills、Rules 与 MCP 工具，恢复为默认 AI 助手状态。

### 彻底卸载 (Uninstall)
直接删除插件目录或软链接：
```powershell
Remove-Item -Path "$HOME\.gemini\config\plugins\lingua-antigravity" -Recurse -Force
```
不会在操作系统或 Antigravity 宿主中留下任何隐藏注册表或常驻后台守护进程。

---

## 5. 版本控制检查点 (Git Checkpoints)

本项目在开发与演进过程中维护清晰的 Git 版本标签：

| 检查点标签 (Tag) | 对应阶段与状态 | 回滚命令 |
| :--- | :--- | :--- |
| `v0.1-docs` | 全套技术文档与回滚方案就绪 | `git checkout v0.1-docs` |
| `v0.2-skills-rules` | 9 大技能包与核心规则移植就绪 | `git checkout v0.2-skills-rules` |
| `v0.3-mcp-server` | MCP 工具服务与沙箱引擎构建就绪 | `git checkout v0.3-mcp-server` |
| `v1.0.0-release` | 全套套件自检通过，生产就绪 | `git checkout v1.0.0-release` |
| `v1.1.0-glossary-compat` | 术语表 5 字段标准（露西.json/露西.xlsx）与 Excel 兼容 | `git checkout v1.1.0-glossary-compat` |
| `v1.2.0-desensitized` | 全量数据脱敏与开源发布 | `git checkout v1.2.0-desensitized` |

---

## 6. 故障排查与恢复检查清单 (Checklist)

- [ ] **项目数据是否完好**：检查 `items/entries.jsonl` 行数是否正常。
- [ ] **Staging 是否干净**：确认 `changes/` 目录在每次 Apply 后均已清空。
- [ ] **MCP 服务是否健康**：运行 `npm test` 确认 MCP 服务端各单元测试 100% 通过。
- [ ] **备份目录大小**：定期归档或清理 `.backup/` 中超过 30 天的历史快照。
