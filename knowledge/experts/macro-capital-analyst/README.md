# 知识底座（knowledge base）—— 本仓不含材料本体

## 先说结论

**这个目录里没有 38 份材料本身。** 它们是受版权约束的原著／教材／论文，**不随包分发**；
本仓只公开「方法论内化摘要层」（观澜本人的提炼与框架，MIT）。

所以 `source/SOURCE-MANIFEST.json` 里每一条 `materials[].fileRef` 在本仓**都解析不到** ——
这是设计，不是缺文件（38/38 条 `distributable: false`）。解析根写在同文件的 `fileRefRoot` 字段里。

## 为什么这样设计

- 包要能被自由使用／修改（MIT），就不能把别人的版权文本一起分发；
- 但「用哪 38 份源、每一份提炼了什么」必须可追溯 —— 这部分在 `SOURCE-MANIFEST.json`（溯源账本）与
  专家 Profile 的 `knowledgeBindings` 里。

## 如何自建你自己的知识底座

1. **按 `SOURCE-MANIFEST.json` 的 `materials[]` 清单准备你自己的材料**：`title`／`author`／`type` 给出了
   每一条的来源身份；把对应文件放到你本地的一个根目录下（路径与 `fileRefRoot` 保持一致即可）。
2. **给每一条写"内化摘要"**：这个包的方法论建立在「不只是读过、而是提炼成可执行判据」之上 ——
   摘要里应当出现：口径、量纲、可复跑的读数判据，而不是复述原文。
3. **改 `fileRefRoot` / `fileRef` 指向你自己的根**，然后跑：

   ```bash
   node scripts/check-pack.mjs      # fileRef 会被查"是否含绝对路径/URL/内网地址"（安全），不查存在性
   node scripts/repin-digests.mjs   # 若你改了 SOURCE-MANIFEST，本体快照的 digest 需要重钉
   ```

4. **版权边界**：只放你**有权使用**的材料；不要把受版权保护的原文提交进本仓
   （`.gitignore` 已排除 `books/`、`source/library/`、`source/raw/` 与常见电子书格式）。

5. **本体（ontology）**：`domain-knowledge/macro-capital-analyst-kb.json` 里的 `collections[].root`
   指向本目录；若你的根不在仓内，请保留该 collection 的 `note` 说明（否则 `check-pack` 的
   `structure-collection-root` 会判为"缺文件"）。
