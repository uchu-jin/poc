---
description: 6. 実装を3観点の並列サブエージェントでレビューする
argument-hint: <プランファイル名>
---

実装が終わった。対象プラン：.claude/plans/$ARGUMENTS

次の3体のサブエージェントを並列で起動し、報告を P0 から P2 に整理して返すこと。

- design-reviewer：プランドキュメントとの乖離
- edge-case-reviewer：異常系と境界値の抜け
- security-reviewer：セキュリティ観点

修正は P0／P1 について私が指示してから行うこと。

終わったら docs/workflow.md の「機能ごとの進み具合」で、この機能の行を更新すること（段階 6・状態・次の一手。飛ばした段階や見送った指摘があれば「メモ」に理由を書く）。
