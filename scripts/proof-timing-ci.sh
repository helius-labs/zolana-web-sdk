#!/usr/bin/env bash
# The proof timing report of a CI run: each runner's timing log under
# ZOLANA_TIMING_DIR/<label>/, against that runner's last report in the
# history of `main` (scripts/proof-timing-history.sh) on the same processor,
# for the runners ZOLANA_TIMING_COMPARE names, into the job summary,
# a report.json per runner, ZOLANA_TIMING_DIR/report.md, and one comment on
# the pull request, updated in place.
#
#   proof-timing-ci.sh
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
timing="${ZOLANA_TIMING_DIR:?set ZOLANA_TIMING_DIR}"
if ! compgen -G "$timing/*/*.log" > /dev/null; then
  echo "::notice::no proof timing logs under $timing"
  exit 0
fi

after=""
if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
  # A pull request's run is of a merge commit; name the head it tests.
  if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
    head="$(jq -r .pull_request.head.sha "$GITHUB_EVENT_PATH")"
    after="this pull request at [\`${head:0:7}\`](https://github.com/$GITHUB_REPOSITORY/commit/$head)"
  else
    after="\`main\` at [\`${GITHUB_SHA:0:7}\`](https://github.com/$GITHUB_REPOSITORY/commit/$GITHUB_SHA)"
  fi
  # Each compared runner against its last report of main before this commit
  # on the same processor: a hosted runner lands on several processor types,
  # and one commit takes up to twice as long on one as on another. A rerun
  # after the history took this commit compares with the one before.
  for dir in "$timing"/*/; do
    label="$(basename "$dir")"
    if [[ " ${ZOLANA_TIMING_COMPARE:-} " != *" $label "* ]]; then
      echo "::notice::$label is timed, not compared"
      continue
    fi
    cpu="$(jq -r '.cpu // empty' "$dir/runner.json" 2> /dev/null || true)"
    if last="$(gh api "repos/$GITHUB_REPOSITORY/contents/history/$label.jsonl?ref=proof-timing" \
        -H 'Accept: application/vnd.github.raw' 2> /dev/null \
        | jq -c --arg sha "$GITHUB_SHA" --arg cpu "$cpu" 'select(.commit != $sha and .runner.cpu == $cpu)' \
        | tail -n 1)" && [[ -n "$last" && -n "$cpu" ]]; then
      printf '%s\n' "$last" > "$dir/baseline.json"
    else
      echo "::notice::no proof timing history for $label on ${cpu:-an unnamed processor} on main yet"
    fi
  done
fi

node "$repo_root/scripts/proof-timing-report.mjs" \
  --logs "$timing" \
  ${GITHUB_REPOSITORY:+--repo "$GITHUB_REPOSITORY"} \
  ${after:+--after "$after"} \
  --summary "${GITHUB_STEP_SUMMARY:-/dev/null}" > "$timing/report.md"
cat "$timing/report.md"

if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
  number="$(jq -r .pull_request.number "$GITHUB_EVENT_PATH")"
  marker="<!-- proof-timing -->"
  body="$(printf '%s\n%s' "$marker" "$(cat "$timing/report.md")")"
  existing="$(gh api "repos/$GITHUB_REPOSITORY/issues/$number/comments" --paginate --jq ".[] | select(.body | startswith(\"$marker\")) | .id" | head -1 || true)"
  if [[ -n "$existing" ]]; then
    gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$existing" -f body="$body" > /dev/null || echo "::notice::could not update the proof timing comment"
  else
    gh api -X POST "repos/$GITHUB_REPOSITORY/issues/$number/comments" -f body="$body" > /dev/null || echo "::notice::could not post the proof timing comment"
  fi
fi
