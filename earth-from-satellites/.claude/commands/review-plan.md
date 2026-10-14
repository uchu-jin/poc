---
description: 2. プランを観点別にAIレビューする（例：/review-plan invoice-ocr セキュリティ）
argument-hint: <プランファイル名> <設計整合性|セキュリティ|運用・ビジネス整合性>
---

plan-reviewer サブエージェントで、.claude/plans/ の次のプランをレビューすること：$ARGUMENTS

- 観点が指定されていなければ、設計整合性／セキュリティ／運用・ビジネス整合性の3観点を、別々の plan-reviewer として並列に起動する
- 判定の基準：docs/rules/、docs/requirements/requirements.md
- 結果を P0 → P1 → P2 の順に整理して返すこと。プランの修正は私の指示を待つこと
