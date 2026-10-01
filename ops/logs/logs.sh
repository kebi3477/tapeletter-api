#!/bin/sh
# 로그 조회 (미니PC). docs/deploy.md "로그 조회" 참고.
#
#   ops/logs/logs.sh api  [옵션]   API 요청 기록 (request_logs 표, 최근 것부터)
#   ops/logs/logs.sh edge [옵션]   edge Caddy 접속 로그 (JSON 파일, 최근 것부터, jq 필요)
#
# 옵션 (둘 다):
#   -m <분>        최근 N분 (기본 60)
#   -s <상태>      상태 코드: 401 · 4xx · 5xx
#   -p <경로>      경로에 이 문자열이 들어간 것 (예: /api/auth)
#   -n <개수>      최대 줄 수 (기본 50)
# api만:
#   -r <요청 ID>   X-Request-Id (기간과 상관없이 찾는다)
#   -u <사용자 ID> 회원 UUID
#   -a             소셜 로그인 실패만 (provider와 사유가 detail에 있다)
#   -v             detail(로그인 실패 사유, 5xx 스택) 전체를 보여 준다
# edge만:
#   -i <IP>        클라이언트 IP
#
# 기본은 docker compose의 postgres·edge 컨테이너에서 읽는다 (ENV_FILE, 기본 .env.production).
# 로컬에서 시험할 때: LOGS_PSQL="psql cassette_dev" ops/logs/logs.sh api -m 10
set -eu
cd "$(dirname "$0")/../.."

cmd="${1:-}"
[ $# -gt 0 ] && shift
MIN=60 STATUS="" PATH_LIKE="" LIMIT=50 RID="" UID_="" AUTH=0 VERBOSE=0 IP=""
while getopts "m:s:p:n:r:u:avi:" opt; do
  case "$opt" in
    m) MIN="$OPTARG" ;;
    s) STATUS="$OPTARG" ;;
    p) PATH_LIKE="$OPTARG" ;;
    n) LIMIT="$OPTARG" ;;
    r) RID="$OPTARG" ;;
    u) UID_="$OPTARG" ;;
    a) AUTH=1 ;;
    v) VERBOSE=1 ;;
    i) IP="$OPTARG" ;;
    *) sed -n '2,20p' "$0"; exit 1 ;;
  esac
done
echo "$MIN" | grep -Eq '^[0-9]+$' || { echo "-m는 숫자(분)로 적어 주세요" >&2; exit 1; }
echo "$LIMIT" | grep -Eq '^[0-9]+$' || { echo "-n은 숫자로 적어 주세요" >&2; exit 1; }
case "$STATUS" in ''|[1-5]xx|[1-5][0-9][0-9]) ;; *) echo "-s는 401 · 4xx · 5xx 모양이에요" >&2; exit 1 ;; esac

COMPOSE="docker compose --env-file ${ENV_FILE:-.env.production}"

run_psql() {
  if [ -n "${LOGS_PSQL:-}" ]; then
    # shellcheck disable=SC2086
    $LOGS_PSQL -X -q -v ON_ERROR_STOP=1 "$@"
  else
    $COMPOSE exec -T postgres \
      sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"
  fi
}

case "$cmd" in
  api)
    # 상태 조건: 401 → 401..401, 4xx → 400..499
    case "$STATUS" in
      '') LO=0 HI=999 ;;
      ?xx) d=$(echo "$STATUS" | cut -c1); LO="${d}00" HI="${d}99" ;;
      *) LO="$STATUS" HI="$STATUS" ;;
    esac
    run_psql -v min="$MIN" -v lo="$LO" -v hi="$HI" -v path="$PATH_LIKE" -v lim="$LIMIT" \
      -v rid="$RID" -v uid="$UID_" -v auth="$AUTH" -v verbose="$VERBOSE" <<'SQL'
SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI:SS') AS "시각(KST)",
       request_id AS "요청 ID",
       method || ' ' || path AS "요청",
       status AS "상태",
       duration_ms AS "ms",
       COALESCE(error_code, '') AS "오류",
       COALESCE(user_id::text, '') AS "사용자",
       COALESCE(ip, '') AS "IP",
       concat_ws(' ', platform, app_version) AS "앱",
       CASE WHEN :'verbose' = '1' THEN COALESCE(detail, '')
            ELSE left(split_part(COALESCE(detail, ''), E'\n', 1), 80) END AS "사유"
  FROM request_logs
 WHERE (:'rid' <> '' AND request_id = :'rid')
    OR (:'rid' = ''
        AND created_at > now() - make_interval(mins => :'min'::int)
        AND status BETWEEN :'lo'::int AND :'hi'::int
        AND (:'path' = '' OR path LIKE '%' || :'path' || '%')
        AND (:'uid' = '' OR user_id::text = :'uid')
        AND (:'auth' = '0' OR detail LIKE '% 로그인 실패(%'))
 ORDER BY created_at DESC
 LIMIT :'lim'::int;
SQL
    ;;
  edge)
    command -v jq >/dev/null || { echo "jq가 필요해요 (sudo apt install jq)" >&2; exit 1; }
    since=$(( $(date +%s) - MIN * 60 ))
    # 롤링된 파일은 gzip이다. 시간순으로 이어 붙인 뒤 조건으로 거른다
    $COMPOSE -f docker-compose.yml -f docker-compose.edge.yml exec -T edge \
      sh -c 'ls -1tr /var/log/caddy/access*.log* 2>/dev/null | while read -r f; do case "$f" in *.gz) zcat "$f" ;; *) cat "$f" ;; esac; done' |
      jq -rc --argjson since "$since" --arg status "$STATUS" --arg path "$PATH_LIKE" --arg ip "$IP" '
        select(.ts >= $since)
        | select($status == "" or (.status | tostring) == $status
                 or ($status | test("^[1-5]xx$")) and ((.status | tostring)[0:1] == $status[0:1]))
        | select($path == "" or (.request.uri | contains($path)))
        | select($ip == "" or .request.client_ip == $ip)
        | [(.ts | floor | strflocaltime("%m-%d %H:%M:%S")), .request.client_ip, .request.method,
           .request.uri, .status, ((.duration * 1000) | floor | tostring) + "ms",
           (.request.headers["User-Agent"][0] // "" | .[0:60])] | @tsv' |
      tail -n "$LIMIT"
    ;;
  *)
    sed -n '2,20p' "$0"
    exit 1
    ;;
esac
