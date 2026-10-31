# 作業開始・ブランチ・コミット

## 作業開始前

1. `git branch --show-current` で現在のブランチを確認する。保護ブランチ（`git.protectedBranches`）にいたら、作業ブランチを切る。
2. `git fetch` して `origin/{baseBranch}` との差を確認する。遅れていれば作業前に `git pull`（または rebase）する。
3. `gh issue list --state open` で該当する Issue を探す。`git.issueRequiredFor` に含まれる type（例: feat・fix）の作業で Issue がなければ、先に起票する（[issue.md](issue.md)）。

## ブランチ名

`git.branchPatterns` のどれかに合わせる。`{n}` は Issue 番号、`{slug}` は英小文字とハイフンの短い概要。

```bash
git switch -c feature/issue-12-weekly-target
```

## コミットメッセージ

```
{type}({scope}): {概要} (#{Issue番号})
```

- type は `git.commitTypes` から選ぶ。迷ったら「動きが変わるか」で判断する。変わるなら `feat` か `fix`、変わらない整理なら `refactor` か `chore`。文書だけなら `docs`、テストだけなら `test`。
- scope は `git.commitScopes` のキーから、変更したパスに対応するものを選ぶ。複数の層にまたがるなら、コミットを分ける。
- Issue がある場合は末尾に `(#番号)` を付ける。`git.requireIssueNumberInCommit` が true なら必須。
- 本文の末尾には、会話で指定された Co-Authored-By 行を付ける。

```bash
git commit -m "$(cat <<'EOF'
feat(backend): 週次目安の計算を追加 (#12)

Co-Authored-By: ...
EOF
)"
```
