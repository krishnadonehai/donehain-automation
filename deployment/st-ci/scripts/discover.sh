#!/usr/bin/env bash
# =============================================================================
# DoneHai ST VPS - read-only discovery (Phase 0)
# =============================================================================
# Prints a report to stdout. It writes no files, installs nothing, restarts
# nothing, and never reads private keys, .env contents, container environment
# variables, process command lines, or database data. All output passes
# through a redaction filter.
#
# Usage (nothing is copied to the VPS):
#   ssh <user>@<vps> 'tr -d "\r" | bash -s' < deployment/st-ci/scripts/discover.sh > st-discovery.txt
#
# Optional:
#   LIVE_REPO_DIR=/path/to/DoneHai-Feature   (otherwise taken from the
#                                             donehai-server compose labels)
#
# Local only (synthetic data, no system inspection):
#   bash deployment/st-ci/scripts/discover.sh --self-test
# =============================================================================

set -u
export LC_ALL=C
export GIT_OPTIONAL_LOCKS=0
export GIT_TERMINAL_PROMPT=0

ST_APP_HOST="app.st.donehai.com"
ST_API_HOST="api.st.donehai.com"
UNTRACKED_FILES=(
  "server/cachecheck.js"
  "server/database/migrations/0"
  "server/database/migrations/="
  "server/scripts/hierarchy-319320.csv"
)
PROXY_PROCESS_NAMES='nginx|openresty|caddy|traefik|haproxy|apache2|httpd|cloudflared|envoy'
PROXY_IMAGE_PATTERN='nginx|openresty|caddy|traefik|cloudflared|haproxy|swag|proxy-manager'

section() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
dk() { timeout 15 docker "$@"; }
run() {
  timeout 20 "$@" 2>&1
  local rc=$?
  [ "$rc" -eq 0 ] || printf '(command exited %s: %s)\n' "$rc" "$1"
}

redact() {
  # A private key block is dropped from its BEGIN line through its END line,
  # or through end of input when the END marker is missing.
  awk '
    !in_key && /-----BEGIN [A-Z ]*PRIVATE KEY-----/ { print "[REDACTED PRIVATE KEY]"; in_key = 1 }
    in_key { if (/-----END [A-Z ]*PRIVATE KEY-----/) in_key = 0; next }
    { print }' |
  sed -E \
    -e 's#(://)[^/@[:space:]]+@#\1[REDACTED]@#g' \
    -e 's#(bearer|basic)[[:space:]]+[A-Za-z0-9+/=._~-]{8,}#\1 [REDACTED]#Ig' \
    -e 's#((proxy-)?authorization|cookie)(["'"'"']?[[:space:]]*[=:]?[[:space:]]*).+$#\1\3[REDACTED]#Ig' \
    -e 's#((pass(word|wd)?|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|credential|dsn)[A-Za-z0-9_.-]*["'"'"']?[[:space:]]*[=:][[:space:]]*)[^[:space:],;]+#\1[REDACTED]#Ig' \
    -e 's#(--?(token|password|passwd|secret|api-key|apikey|key)[= ])[^[:space:]]+#\1[REDACTED]#Ig' \
    -e 's#(sk-[A-Za-z0-9_-]{10,}|SG\.[A-Za-z0-9_.-]{10,}|GOCSPX-[A-Za-z0-9_-]{6,}|AIza[0-9A-Za-z_-]{20,}|rzp_(test|live)_[A-Za-z0-9]{6,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[abposr]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)#[REDACTED]#g' \
    -e 's#[^[:space:]=]*(letsencrypt|/ssl/private|privkey|fullchain|\.pem|\.p12|\.pfx|\.key([^A-Za-z0-9_]|$)|cloudflared/[^[:space:]]*\.json)[^[:space:]]*#[CREDENTIAL PATH HIDDEN]#Ig'
}

# ---------------------------------------------------------------------------
# Proxy config parsers. Each prints only app.st/api.st (or *.st) host blocks
# and, inside them, only the directives that identify the upstream. Anything
# else (auth, headers, includes, certificate paths, other vhosts) is dropped.
# awk code avoids POSIX character classes so it also runs under old mawk.
#
# Paths and query strings can carry tokens the redactor cannot recognise, so
# routing values keep only scheme://host:port and path segments that are
# lowercase, at most 24 characters and at most 2 digits; any other segment
# becomes [MASKED] and query strings are dropped.
# ---------------------------------------------------------------------------

AWK_MASK='
function safe_seg(s,   d) {
  d = gsub(/[0-9]/, "&", s)
  return length(s) <= 24 && d <= 2 && s ~ /^[a-z0-9*._()^$|?+~=@-]*$/
}
function mask_path(p,   n, i, seg, out) {
  n = split(p, seg, "/"); out = ""
  for (i = 1; i <= n; i++) out = out (i > 1 ? "/" : "") (safe_seg(seg[i]) ? seg[i] : "[MASKED]")
  return out
}
function mask_tok(t, target,   i, rest, s, auth, path, q, qs) {
  gsub(/"/, "", t)
  if (t ~ /^[a-z][a-z0-9+.-]*:\/\//) {
    i = index(t, "://"); rest = substr(t, i + 3); qs = ""
    q = index(rest, "?"); if (q) { rest = substr(rest, 1, q - 1); qs = "?[MASKED]" }
    s = index(rest, "/")
    if (s) { auth = substr(rest, 1, s - 1); path = substr(rest, s) } else { auth = rest; path = "" }
    sub(/^.*@/, "", auth)
    return substr(t, 1, i + 2) auth mask_path(path) qs
  }
  if (target && t !~ /\//) return t
  return mask_path(t)
}
function mask_line(t, target,   n, w, i, out) {
  n = split(t, w, /[ \t]+/); out = w[1]
  for (i = 2; i <= n; i++) out = out " " mask_tok(w[i], target)
  return out
}
'

parse_nginx() {
  awk "$AWK_MASK"'
  function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
  function st_host(h) { return h ~ /^(app\.|api\.|\*\.|\.)st\.donehai\.com$/ }
  function flush(   i) {
    if (s_match) {
      print "--- " s_file " server block (line " s_line ")"
      for (i = 1; i <= s_n; i++) print "    " s_out[i]
      for (i = 1; i <= s_rn; i++) refs[s_ref[i]] = 1
    }
    in_s = 0; s_match = 0; s_n = 0; s_rn = 0
  }
  FNR == 1 { if (in_s) flush(); depth = 0; in_u = 0 }
  {
    line = $0
    sub(/#.*/, "", line)
    opens = gsub(/\{/, "{", line)
    closes = gsub(/\}/, "}", line)
    n = split(line, stmt, /[;{}]/)
    for (j = 1; j <= n; j++) {
      t = trim(stmt[j])
      if (t == "") continue
      if (!in_s && !in_u) {
        if (t == "server" && opens > 0) {
          in_s = 1; s_depth = depth; s_file = FILENAME; s_line = FNR
        } else if (t ~ /^upstream[ \t]+[^ \t]+$/ && opens > 0) {
          split(t, f, /[ \t]+/); u_name = f[2]; in_u = 1; u_depth = depth
          u_text[u_name] = "--- " FILENAME " upstream " u_name
        }
      } else if (in_s) {
        if (t ~ /^server_name[ \t]/) {
          m = split(t, f, /[ \t]+/); hosts = ""
          for (i = 2; i <= m; i++) if (st_host(f[i])) hosts = hosts " " f[i]
          if (hosts != "") { s_match = 1; s_out[++s_n] = "server_name" hosts }
        } else if (t ~ /^listen[ \t]/) {
          s_out[++s_n] = t
        } else if (t ~ /^location[ \t]/) {
          s_out[++s_n] = mask_line(t, 0)
        } else if (t ~ /^(proxy_pass|grpc_pass)[ \t]/) {
          s_out[++s_n] = mask_line(t, 1)
          split(t, f, /[ \t]+/); r = f[2]
          sub(/^[a-z]+:\/\//, "", r); sub(/[\/:].*$/, "", r)
          s_ref[++s_rn] = r
        }
      } else if (in_u && t ~ /^server[ \t]/) {
        u_text[u_name] = u_text[u_name] "\n    " t
      }
    }
    depth += opens - closes
    if (in_s && depth <= s_depth) flush()
    if (in_u && depth <= u_depth) in_u = 0
  }
  END {
    if (in_s) flush()
    for (r in refs) if (r in u_text) print u_text[r]
  }' "$@"
}

parse_caddy() {
  awk "$AWK_MASK"'
  function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
  function st_addr(a) {
    sub(/^[a-z]+:\/\//, "", a); sub(/:[0-9]+$/, "", a)
    return a ~ /^(app\.|api\.|\*\.)st\.donehai\.com$/
  }
  FNR == 1 { depth = 0; in_site = 0 }
  {
    line = $0
    sub(/(^|[ \t])#.*/, "", line)
    opens = gsub(/\{/, "{", line)
    closes = gsub(/\}/, "}", line)
    n = split(line, stmt, /[{}]/)
    for (j = 1; j <= n; j++) {
      t = trim(stmt[j])
      if (t == "") continue
      if (depth == 0 && j == 1 && opens > 0) {
        in_site = 0
        if (t !~ /^\(/) {
          m = split(t, f, /[ \t,]+/); hosts = ""
          for (i = 1; i <= m; i++) if (st_addr(f[i])) hosts = hosts " " f[i]
          if (hosts != "") { in_site = 1; print "--- " FILENAME " site" hosts }
        }
        continue
      }
      if (in_site && (t ~ /^reverse_proxy([ \t]|$)/ || t ~ /^to[ \t]/ || t ~ /^handle(_path)?([ \t]|$)/ || t ~ /^route([ \t]|$)/))
        print "    " mask_line(t, 1)
    }
    depth += opens - closes
    if (depth <= 0) { depth = 0; in_site = 0 }
  }' "$@"
}

parse_cloudflared() {
  awk "$AWK_MASK"'
  function st_host(h) { gsub(/"/, "", h); return h ~ /^(app\.|api\.|\*\.)st\.donehai\.com$/ }
  FNR == 1 { want = 0 }
  /^[ \t]*-?[ \t]*hostname:/ {
    h = $0; sub(/^[^:]*:[ \t]*/, "", h); sub(/[ \t]+$/, "", h)
    want = st_host(h)
    if (want) print "--- " FILENAME " ingress hostname: " h
    next
  }
  /^[ \t]*-[ \t]/ { want = 0 }
  want && /^[ \t]*service:/ {
    s = $0; sub(/^[^:]*:[ \t]*/, "", s); sub(/[ \t]+$/, "", s)
    print "    service: " mask_tok(s, 1); want = 0
  }' "$@"
}

parse_apache() {
  awk "$AWK_MASK"'
  function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
  function st_host(h) { return h ~ /^(app\.|api\.|\*\.)st\.donehai\.com(:[0-9]+)?$/ }
  FNR == 1 { in_v = 0 }
  { t = trim($0) }
  t ~ /^<VirtualHost[ \t>]/ { in_v = 1; v_match = 0; v_n = 0; v_head = t; v_file = FILENAME; next }
  t ~ /^<\/VirtualHost>/ {
    if (in_v && v_match) { print "--- " v_file " " v_head; for (i = 1; i <= v_n; i++) print "    " v_out[i] }
    in_v = 0; next
  }
  in_v && t ~ /^(ServerName|ServerAlias)[ \t]/ {
    m = split(t, f, /[ \t]+/); hosts = ""
    for (i = 2; i <= m; i++) if (st_host(f[i])) hosts = hosts " " f[i]
    if (hosts != "") { v_match = 1; v_out[++v_n] = f[1] hosts }
    next
  }
  in_v && t ~ /^(ProxyPass|ProxyPassReverse)[ \t]/ { v_out[++v_n] = mask_line(t, 1) }' "$@"
}

# stdin: container name on the first line, then "  key=value" label lines.
# Router rules are rebuilt from Host*/Path* matchers only; other matchers
# (Headers, Query, ClientIP, ...) can carry secret values and are dropped.
parse_traefik_labels() {
  awk "$AWK_MASK"'
  function st_host(h) { return h ~ /^(app|api)\.st\.donehai\.com$/ }
  function rule_view(v,   rest, left, out, m, rs, rl, name, inner, args, arg, p) {
    rest = v; left = ""; out = ""
    while (match(rest, /(Host|HostSNI|HostRegexp|Path|PathPrefix|PathRegexp)\([^)]*\)/)) {
      rs = RSTART; rl = RLENGTH
      m = substr(rest, rs, rl); left = left substr(rest, 1, rs - 1); rest = substr(rest, rs + rl)
      p = index(m, "("); name = substr(m, 1, p - 1); inner = substr(m, p + 1, length(m) - p - 1); args = ""
      while (match(inner, /[`"][^`"]*[`"]/)) {
        arg = substr(inner, RSTART + 1, RLENGTH - 2); inner = substr(inner, RSTART + RLENGTH)
        if (name ~ /^Host/) arg = st_host(arg) ? arg : "[other host]"; else arg = mask_path(arg)
        args = args (args == "" ? "" : ",") "`" arg "`"
      }
      out = out (out == "" ? "" : " ; ") name "(" args ")"
    }
    left = left rest
    gsub(/[ \t&|()!]/, "", left)
    if (out == "") return "[no Host/Path matchers recognised]"
    return left == "" ? out : out " [only Host/Path matchers shown]"
  }
  NR == 1 { name = $0; next }
  {
    line = $0; sub(/^[ \t]+/, "", line)
    eq = index(line, "="); if (!eq) next
    k = substr(line, 1, eq - 1); lab[k] = substr(line, eq + 1); keys[++nk] = k
  }
  END {
    for (i = 1; i <= nk; i++) {
      k = keys[i]
      if (k ~ /^traefik\.(http|tcp)\.routers\.[^.]+\.rule$/ && lab[k] ~ /(app|api)\.st\.donehai\.com/) {
        r = k; sub(/\.rule$/, "", r)
        if (!shown) { print "--- container " name; shown = 1 }
        print "    " k "=" rule_view(lab[k])
        if ((r ".service") in lab) print "    " r ".service=" lab[r ".service"]
        if ((r ".entrypoints") in lab) print "    " r ".entrypoints=" lab[r ".entrypoints"]
      }
    }
    if (shown)
      for (i = 1; i <= nk; i++)
        if (keys[i] ~ /^traefik\.(http|tcp)\.services\.[^.]+\.loadbalancer\.server\.port$/) print "    " keys[i] "=" lab[keys[i]]
  }'
}

# run_parser <nginx|caddy|cloudflared|apache> <label> <files...>
run_parser() {
  local kind="$1" label="$2"; shift 2
  local readable=() f out
  for f in "$@"; do
    [ -n "$f" ] || continue
    if [ -r "$f" ]; then readable+=("$f"); else printf '  %s: not readable by this user: %s\n' "$label" "$f"; fi
  done
  if [ "${#readable[@]}" -eq 0 ]; then printf '  %s: no readable config files\n' "$label"; return; fi
  out=$("parse_$kind" "${readable[@]}" 2>/dev/null)
  if [ -n "$out" ]; then
    printf '%s\n' "$out"
  else
    printf '  %s: no app.st/api.st entries in %s readable file(s)\n' "$label" "${#readable[@]}"
  fi
}

http_code() {
  # Status code only; response bodies are never printed.
  printf '%-55s %s\n' "$1" "$(curl -q -sS -o /dev/null -m 10 -w '%{http_code}' "$1" 2>/dev/null || echo 'unreachable')"
}

DOCKER_OK=0

report_host() {
  section "HOST"
  printf 'generated_at: %s\n' "$(date -Is)"
  printf 'hostname: %s\n' "$(hostname)"
  [ -r /etc/os-release ] && grep -E '^PRETTY_NAME=' /etc/os-release
  printf 'kernel: %s\n' "$(uname -r)"
  printf 'cpus: %s\n' "$(nproc 2>/dev/null)"
  printf 'uptime/load: %s\n' "$(uptime)"
  echo; run free -h
  echo
  local dirs=(/)
  for d in /var/lib/docker /opt /srv /home; do [ -d "$d" ] && dirs+=("$d"); done
  run df -h "${dirs[@]}"
  echo; have ip && run ip -br addr
}

report_access() {
  section "ACCESS"
  printf 'user: %s\n' "$(id)"
  if [ "$(id -u)" -eq 0 ]; then echo 'running_as_root: yes'; else echo 'running_as_root: no'; fi
  if have docker; then
    if dk info >/dev/null 2>&1; then
      DOCKER_OK=1
      echo 'docker_access: yes'
      printf 'docker_server: %s\n' "$(dk version --format '{{.Server.Version}}' 2>/dev/null)"
      printf 'docker_root_dir: %s\n' "$(dk info --format '{{.DockerRootDir}}' 2>/dev/null)"
      printf 'compose: %s\n' "$(dk compose version --short 2>/dev/null || echo 'compose v2 plugin not available')"
      have docker-compose && printf 'docker-compose (v1): %s\n' "$(timeout 15 docker-compose version --short 2>/dev/null)"
    else
      echo 'docker_access: no (docker CLI present but daemon not accessible to this user)'
    fi
  else
    echo 'docker_access: no (docker CLI not found)'
  fi
}

report_ports() {
  section "LISTENING TCP PORTS"
  if have ss; then
    if [ "$(id -u)" -eq 0 ]; then run ss -ltnp; else run ss -ltn; echo '(process names need root)'; fi
  else
    echo 'ss not available'
  fi
}

report_proxy_processes() {
  section "REVERSE PROXY - PROCESSES AND SERVICES (names only)"
  local procs
  procs=$(ps -eo comm= 2>/dev/null | grep -xE "$PROXY_PROCESS_NAMES" | sort | uniq -c | awk '{ print "process " $2 " x" $1 }')
  printf '%s\n' "${procs:-no proxy processes found by name}"
  if have systemctl; then
    for s in nginx caddy traefik haproxy apache2 httpd cloudflared; do
      printf 'systemd %-12s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null)"
    done
  fi
  have nginx && printf 'nginx_version: %s\n' "$(nginx -v 2>&1)"
  have caddy && printf 'caddy_version: %s\n' "$(caddy version 2>&1 | head -n1)"
  have cloudflared && printf 'cloudflared_version: %s\n' "$(cloudflared --version 2>&1 | head -n1)"
}

report_proxy_host_configs() {
  section "REVERSE PROXY - HOST CONFIG (app.st/api.st upstreams only)"
  local f nginx=() caddy=() cfd=() apache=()
  for f in /etc/nginx/nginx.conf /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/*; do [ -f "$f" ] && nginx+=("$f"); done
  for f in /etc/caddy/Caddyfile /etc/caddy/*.caddy /etc/caddy/conf.d/* /etc/caddy/sites-enabled/*; do [ -f "$f" ] && caddy+=("$f"); done
  for f in /etc/cloudflared/config.yml /etc/cloudflared/config.yaml "${HOME:-/nonexistent}/.cloudflared/config.yml" "${HOME:-/nonexistent}/.cloudflared/config.yaml"; do
    [ -f "$f" ] && cfd+=("$f")
  done
  for f in /etc/apache2/sites-enabled/* /etc/httpd/conf.d/*.conf /etc/httpd/conf/httpd.conf; do [ -f "$f" ] && apache+=("$f"); done

  if [ "${#nginx[@]}" -gt 0 ]; then run_parser nginx nginx "${nginx[@]}"
  elif [ -d /etc/nginx ]; then echo '  nginx: /etc/nginx present but no enabled config files visible to this user'; fi
  if [ "${#caddy[@]}" -gt 0 ]; then run_parser caddy caddy "${caddy[@]}"
  elif [ -d /etc/caddy ]; then echo '  caddy: /etc/caddy present but no Caddyfile visible to this user'; fi
  if [ "${#cfd[@]}" -gt 0 ]; then run_parser cloudflared cloudflared "${cfd[@]}"
  elif have cloudflared || [ -d /etc/cloudflared ]; then echo '  cloudflared: no local config.yml visible (tunnel may be dashboard-managed)'; fi
  [ "${#apache[@]}" -gt 0 ] && run_parser apache apache "${apache[@]}"
  [ -e /etc/haproxy/haproxy.cfg ] && echo '  haproxy: /etc/haproxy/haproxy.cfg present (not parsed; review manually if haproxy serves ST)'
  [ -d /etc/traefik ] && echo '  traefik: /etc/traefik present (file config not parsed; container labels are reported below)'
  [ "${#nginx[@]}${#caddy[@]}${#cfd[@]}${#apache[@]}" = "0000" ] && echo '  no host proxy config files found'
}

report_proxy_containers() {
  [ "$DOCKER_OK" -eq 1 ] || return
  section "REVERSE PROXY - CONTAINERS (app.st/api.st upstreams only)"
  local found=0 id image name ports files
  while IFS=$'\t' read -r id image name ports; do
    printf '%s\n' "$ports" | grep -qE ':(80|443)->' || printf '%s\n' "$image" | grep -qiE "$PROXY_IMAGE_PATTERN" || continue
    found=1
    printf 'container %s image=%s\n' "$name" "$image"
    files=$(dk inspect --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}{{"\n"}}{{end}}{{end}}' "$id" 2>/dev/null \
      | while read -r src; do
          [ -n "$src" ] || continue
          timeout 20 find "$src" -xdev -maxdepth 4 \( -path '*letsencrypt*' -o -path '*/private*' -o -path '*/certs*' -o -path '*/ssl*' \) -prune \
            -o -type f \( -name '*.conf' -o -name 'Caddyfile*' -o -name '*.caddy' -o -name '*.yml' -o -name '*.yaml' \) -print 2>/dev/null
        done)
    if [ -z "$files" ]; then
      echo '  no readable config files in bind mounts'
      continue
    fi
    local IFS=$'\n'
    set -f
    case "$image" in
      *nginx*|*openresty*|*swag*|*proxy-manager*) run_parser nginx "  nginx" $files ;;
      *caddy*) run_parser caddy "  caddy" $files ;;
      *cloudflared*) run_parser cloudflared "  cloudflared" $files ;;
      *traefik*) echo '  traefik: routing comes from container labels (next section)' ;;
      *) echo '  config not parsed (image not recognised as nginx, caddy or cloudflared)' ;;
    esac
    set +f
    unset IFS
  done < <(dk ps --format '{{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Ports}}' 2>/dev/null)
  [ "$found" -eq 1 ] || echo 'no proxy containers found'

  section "REVERSE PROXY - TRAEFIK ROUTERS FOR app.st/api.st"
  local out=""
  while read -r id; do
    out="$out$(dk inspect --format '{{.Name}}{{range $k,$v := .Config.Labels}}{{"\n"}}  {{$k}}={{$v}}{{end}}' "$id" 2>/dev/null | parse_traefik_labels)"
  done < <(dk ps -q 2>/dev/null)
  printf '%s\n' "${out:-none}"
}

report_tls() {
  section "TLS CERTIFICATES (public certificate metadata only)"
  if [ -d /etc/letsencrypt/live ]; then
    if [ -r /etc/letsencrypt/live ] && [ -x /etc/letsencrypt/live ]; then
      local names
      names=$(ls -1 /etc/letsencrypt/live 2>/dev/null | grep -v '^README$')
      printf 'lets_encrypt_live_dir: present, %s certificate name(s), %s matching st.donehai.com\n' \
        "$(printf '%s\n' "$names" | grep -c .)" "$(printf '%s\n' "$names" | grep -cE '(^|\.)st\.donehai\.com$')"
    else
      echo 'lets_encrypt_live_dir: present (not readable by this user)'
    fi
  else
    echo 'lets_encrypt_live_dir: not present'
  fi
  if have openssl; then
    local h pem sans
    for h in "$ST_APP_HOST" "$ST_API_HOST"; do
      printf -- '--- local :443 SNI=%s\n' "$h"
      pem=$(timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$h" </dev/null 2>/dev/null \
        | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p')
      if [ -z "$pem" ]; then echo '    no TLS answer on 127.0.0.1:443'; continue; fi
      printf '%s\n' "$pem" | openssl x509 -noout -subject -issuer -enddate 2>/dev/null | sed 's/^/    /'
      sans=$(printf '%s\n' "$pem" | openssl x509 -noout -ext subjectAltName 2>/dev/null | tr ',' '\n' | sed -n 's/^[[:space:]]*DNS://p')
      printf '    san_entries: %s total; st.donehai.com entries: %s\n' \
        "$(printf '%s\n' "$sans" | grep -c .)" "$(printf '%s\n' "$sans" | grep -E '(^|\.)st\.donehai\.com$' | paste -sd' ' -)"
    done
  fi

  section "PUBLIC DNS AND EDGE HEADERS"
  for h in "$ST_APP_HOST" "$ST_API_HOST"; do
    printf 'dns %s: %s\n' "$h" "$(getent hosts "$h" 2>/dev/null | awk '{print $1}' | paste -sd' ' -)"
  done
  for u in "https://$ST_APP_HOST/" "https://$ST_API_HOST/health"; do
    printf -- '--- %s\n' "$u"
    curl -q -sS -o /dev/null -D - -m 10 "$u" 2>&1 \
      | grep -iE '^(HTTP/|server:|cf-ray:|via:|x-powered-by:|alt-svc:|curl:)' | sed 's/^/    /'
  done
}

report_docker() {
  [ "$DOCKER_OK" -eq 1 ] || { section "DOCKER"; echo 'skipped: no docker access'; return; }

  section "DOCKER - COMPOSE PROJECTS"
  run docker compose ls -a

  section "DOCKER - CONTAINERS"
  run docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

  section "DOCKER - CONTAINER DETAILS (no env, no command lines)"
  dk ps -aq 2>/dev/null | while read -r id; do
    dk inspect --format '{{.Name}}
  image={{.Config.Image}} id={{slice .Image 7 19}} state={{.State.Status}} started={{.State.StartedAt}} restart={{.HostConfig.RestartPolicy.Name}}
  project={{index .Config.Labels "com.docker.compose.project"}} service={{index .Config.Labels "com.docker.compose.service"}}
  working_dir={{index .Config.Labels "com.docker.compose.project.working_dir"}}
  config_files={{index .Config.Labels "com.docker.compose.project.config_files"}}
  networks={{range $k,$v := .NetworkSettings.Networks}}{{$k}}({{$v.IPAddress}}) {{end}}
  ports={{range $p,$b := .NetworkSettings.Ports}}{{$p}}->{{range $b}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}
  mounts={{range .Mounts}}{{.Type}}:{{if eq .Type "volume"}}{{.Name}}{{else if eq .Type "bind"}}{{.Source}}{{else}}-{{end}}->{{.Destination}}{{if not .RW}}(ro){{end}} {{end}}' "$id" 2>&1
  done

  section "DOCKER - NETWORKS"
  run docker network ls
  dk network ls -q --filter driver=bridge 2>/dev/null | while read -r n; do
    dk network inspect --format '--- {{.Name}} internal={{.Internal}} subnet={{range .IPAM.Config}}{{.Subnet}} {{end}}
    containers: {{range .Containers}}{{.Name}} {{end}}' "$n" 2>&1
  done

  section "DOCKER - VOLUMES"
  dk volume ls -q 2>/dev/null | while read -r v; do
    printf '%s ' "$v"
    dk volume inspect --format 'driver={{.Driver}} project={{index .Labels "com.docker.compose.project"}} mountpoint={{.Mountpoint}}' "$v" 2>&1
  done

  section "DOCKER - IMAGES (deployment / donehai)"
  dk image ls --format 'table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}' 2>/dev/null \
    | grep -iE '^REPOSITORY|deployment|donehai|kafka|redis|postgres|nginx|caddy|traefik|playwright'

  section "DOCKER - DISK USAGE"
  run docker system df
}

report_health() {
  section "LOCAL SERVICE HEALTH (HTTP status codes only)"
  for u in \
    http://127.0.0.1:8080/ \
    http://127.0.0.1:3001/health \
    http://127.0.0.1:3000/health \
    http://127.0.0.1:3000/health/database \
    http://127.0.0.1:3000/health/kafka \
    http://127.0.0.1:3003/health \
    http://127.0.0.1:3012/health \
    "https://$ST_APP_HOST/" \
    "https://$ST_API_HOST/health"; do
    http_code "$u"
  done
}

report_repo() {
  section "LIVE REPOSITORY (read-only git)"
  local dir="${LIVE_REPO_DIR:-}"
  if [ -z "$dir" ] && [ "$DOCKER_OK" -eq 1 ]; then
    dir=$(dk inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' donehai-server 2>/dev/null)
    printf 'compose working_dir of donehai-server: %s\n' "${dir:-<not found>}"
  fi
  if [ -z "$dir" ] || [ ! -d "$dir" ]; then
    echo 'live repository not located; rerun with LIVE_REPO_DIR=/path/to/DoneHai-Feature'
    return
  fi
  if ! have git; then echo 'git not installed'; return; fi

  # safe.directory is matched against the repository root, so locate it
  # without git and trust only that exact path.
  local top
  top=$(cd "$dir" 2>/dev/null && pwd -P) || { echo "not accessible: $dir"; return; }
  while [ "$top" != "/" ] && [ ! -e "$top/.git" ]; do top=$(dirname "$top"); done
  [ -e "$top/.git" ] || { echo "not a git repository: $dir"; return; }
  local g=(timeout 20 git -c "safe.directory=$top" -c core.fsmonitor=false -C "$top")
  "${g[@]}" rev-parse --show-toplevel >/dev/null 2>&1 || { echo "git cannot read repository: $top"; return; }

  printf 'repo_root: %s\n' "$top"
  printf 'owner: %s\n' "$(stat -c '%U:%G' "$top" 2>/dev/null)"
  printf 'branch: %s\n' "$("${g[@]}" rev-parse --abbrev-ref HEAD 2>&1)"
  printf 'head: %s\n' "$("${g[@]}" log -1 --format='%h %cI %s' 2>&1)"
  printf 'upstream: %s\n' "$("${g[@]}" rev-parse --abbrev-ref '@{u}' 2>/dev/null || echo '<none>')"
  printf 'ahead/behind upstream (local refs, no fetch): %s\n' "$("${g[@]}" rev-list --left-right --count 'HEAD...@{u}' 2>/dev/null || echo 'n/a')"
  echo 'remotes:'; "${g[@]}" remote -v 2>&1 | sed 's/^/  /'

  echo; echo 'git status --short:'
  "${g[@]}" --no-optional-locks status --short 2>&1 | sed 's/^/  /'

  echo; echo 'protected untracked files (existence only):'
  for f in "${UNTRACKED_FILES[@]}"; do
    if [ -e "$top/$f" ]; then
      local tracked='untracked'
      "${g[@]}" ls-files --error-unmatch -- "$f" >/dev/null 2>&1 && tracked='TRACKED'
      printf '  present  %-40s %s bytes, %s\n' "$f" "$(stat -c '%s' "$top/$f" 2>/dev/null)" "$tracked"
    else
      printf '  missing  %s\n' "$f"
    fi
  done

  echo; echo 'env files (metadata only, contents never read):'
  for f in deployment/.env .env server/.env api-gateway/.env textnotification-service/.env server/knowledge-service/.env; do
    [ -e "$top/$f" ] && printf '  %-40s %s\n' "$f" "$(stat -c '%A %U:%G %s bytes' "$top/$f" 2>/dev/null)"
  done
}

# ---------------------------------------------------------------------------
# Self-test: synthetic inputs only. Fake secrets are assembled from fragments
# so no complete credential-shaped literal appears in this file.
# ---------------------------------------------------------------------------
self_test() {
  local checks=0 fails=0 out

  expect_redact() {
    checks=$((checks + 1))
    out=$(printf '%s\n' "$1" | redact)
    if [ "$out" != "$2" ]; then
      fails=$((fails + 1))
      printf 'FAIL redact\n  input: %s\n  got:   %s\n  want:  %s\n' "$1" "$out" "$2"
    fi
  }
  expect_has() {
    checks=$((checks + 1))
    printf '%s\n' "$2" | grep -qF -- "$3" || { fails=$((fails + 1)); printf 'FAIL %s: missing "%s"\n%s\n' "$1" "$3" "$2"; }
  }
  expect_not() {
    checks=$((checks + 1))
    if printf '%s\n' "$2" | grep -qF -- "$3"; then fails=$((fails + 1)); printf 'FAIL %s: leaked "%s"\n%s\n' "$1" "$3" "$2"; fi
  }

  local fake="notReal-0000"
  local sk="sk-""proj-""EXAMPLEnotREAL0000000000"
  local sg="SG"".EXAMPLEnotREAL00.EXAMPLEnotREAL00000"
  local gocspx="GOCSPX""-EXAMPLEnotREAL000"
  local aiza="AI""za""EXAMPLEnotREAL0000000000000000000"
  local rzp="rzp_""test_""EXAMPLEnotREAL"
  local ghp="gh""p_""EXAMPLEnotREAL000000000000000000000000"
  local ghpat="github_""pat_""EXAMPLEnotREAL0000000000_EXAMPLE"
  local akia="AK""IA""EXAMPLE000000000"
  local xox="xo""xb-""000000000000-EXAMPLEnotREAL"
  local jwt="ey""JhbGciOiJIUzI1NiJ9"".""eyJzdWIiOiJleGFtcGxlIn0"".""EXAMPLEsignature0000"
  local begin="-----BEGIN ""PRIVATE KEY-----" end="-----END ""PRIVATE KEY-----"
  local begin_ssh="-----BEGIN OPENSSH ""PRIVATE KEY-----" end_ssh="-----END OPENSSH ""PRIVATE KEY-----"

  # Secrets that must be redacted.
  expect_redact "DB_PASSWORD=$fake" "DB_PASSWORD=[REDACTED]"
  expect_redact "PGPASSWORD=$fake" "PGPASSWORD=[REDACTED]"
  expect_redact "JWT_SECRET_KEY=$fake" "JWT_SECRET_KEY=[REDACTED]"
  expect_redact "GATEWAY_INTERNAL_TOKEN=$fake" "GATEWAY_INTERNAL_TOKEN=[REDACTED]"
  expect_redact "RAZORPAY_KEY_SECRET=$fake" "RAZORPAY_KEY_SECRET=[REDACTED]"
  expect_redact "\"password\": \"$fake\"," "\"password\": [REDACTED],"
  expect_redact "api_key: $fake" "api_key: [REDACTED]"
  expect_redact "client_secret=$fake" "client_secret=[REDACTED]"
  expect_redact "postgresql://app:$fake@db:5432/x" "postgresql://[REDACTED]@db:5432/x"
  expect_redact "redis://:$fake@redis:6379" "redis://[REDACTED]@redis:6379"
  expect_redact "Authorization: Bearer $fake" "Authorization: [REDACTED]"
  expect_redact "Authorization: Bearer abc" "Authorization: [REDACTED]"
  expect_redact "proxy_set_header Authorization \"Basic ZmFrZTpmYWtl\";" "proxy_set_header Authorization [REDACTED]"
  expect_redact "Cookie: session=$fake; theme=dark" "Cookie: [REDACTED]"
  expect_redact "cloudflared tunnel run --token $fake" "cloudflared tunnel run --token [REDACTED]"
  expect_redact "--password=$fake" "--password=[REDACTED]"
  expect_redact "credentials-file: /etc/cloudflared/0000.json" "credentials-file: [REDACTED]"
  expect_redact "openai $sk end" "openai [REDACTED] end"
  expect_redact "sendgrid $sg" "sendgrid [REDACTED]"
  expect_redact "google $gocspx" "google [REDACTED]"
  expect_redact "maps $aiza" "maps [REDACTED]"
  expect_redact "razorpay $rzp" "razorpay [REDACTED]"
  expect_redact "github $ghp" "github [REDACTED]"
  expect_redact "github $ghpat" "github [REDACTED]"
  expect_redact "aws $akia" "aws [REDACTED]"
  expect_redact "slack $xox" "slack [REDACTED]"
  expect_redact "jwt $jwt" "jwt [REDACTED]"
  # Private keys: terminated, OpenSSH, unterminated (through end of input),
  # single-line, and two keys in one stream. Key body text must never appear.
  expect_redact "$(printf '%s\n' before "$begin" KEYBODYterminated1 KEYBODYterminated2 "$end" after)" \
    "$(printf '%s\n' before '[REDACTED PRIVATE KEY]' after)"
  expect_redact "$(printf '%s\n' "$begin_ssh" KEYBODYopenssh "$end_ssh")" "[REDACTED PRIVATE KEY]"
  expect_redact "$(printf '%s\n' before "$begin" KEYBODYunterminated1 KEYBODYunterminated2 'after-but-still-inside-key')" \
    "$(printf '%s\n' before '[REDACTED PRIVATE KEY]')"
  expect_redact "$(printf '%s\n' before "x ${begin}KEYBODYinline${end} y" after)" \
    "$(printf '%s\n' before '[REDACTED PRIVATE KEY]' after)"
  expect_redact "$(printf '%s\n' "$begin" KEYBODYfirst "$end" between "$begin_ssh" KEYBODYsecond)" \
    "$(printf '%s\n' '[REDACTED PRIVATE KEY]' between '[REDACTED PRIVATE KEY]')"
  out=$(printf '%s\n' "$begin" KEYBODYa KEYBODYb "$end" "$begin" KEYBODYc | redact)
  expect_not private-key "$out" KEYBODY
  expect_not private-key "$out" "BEGIN"
  expect_redact "mounts=bind:/etc/letsencrypt->/etc/letsencrypt(ro) volume:deployment_db-data->/var/lib/postgresql/data" \
    "mounts=[CREDENTIAL PATH HIDDEN] volume:deployment_db-data->/var/lib/postgresql/data"
  expect_redact "bind:/opt/proxy/ssl/site.key->/k" "[CREDENTIAL PATH HIDDEN]"

  # Ordinary output that must pass through unchanged.
  local keep
  for keep in \
    "proxy_pass http://127.0.0.1:8080" \
    "server_name app.st.donehai.com api.st.donehai.com" \
    "listen 443 ssl http2" \
    "sudo_without_prompt: yes" \
    "docker_access: yes" \
    "compose: 2.29.1" \
    "upstream: origin/rcpa-mine" \
    "  M deployment/docker-compose.no-hazelcast.yml" \
    "  ?? server/cachecheck.js" \
    "  present  server/database/migrations/=                 12 bytes, untracked" \
    "networks=deployment_donehai-network(172.18.0.5) " \
    "lets_encrypt_live_dir: present, 2 certificate name(s), 1 matching st.donehai.com" \
    "    issuer=C=US, O=Let's Encrypt, CN=R11" \
    "basic auth enabled: yes" \
    "process nginx x5"; do
    expect_redact "$keep" "$keep"
  done

  # nginx: only matching server blocks and their upstreams.
  local nginx_cfg
  nginx_cfg=$(cat <<'NGINX'
upstream st_web {
    server 127.0.0.1:8080;
}
upstream unrelated_pool {
    server 10.9.9.9:9999;
}
server {
    listen 443 ssl http2;
    server_name app.st.donehai.com;
    ssl_certificate /etc/letsencrypt/live/app.st.donehai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.st.donehai.com/privkey.pem;
    include /etc/nginx/snippets/secure.conf;
    auth_basic "restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;
    location / {
        proxy_set_header Authorization "Basic ZmFrZTpmYWtl";
        proxy_pass http://st_web;
    }
}
server {
    listen 443 ssl;
    server_name api.st.donehai.com; # api
    location /api/ { proxy_pass http://127.0.0.1:3001; }
}
server {
    listen 443 ssl;
    server_name unrelated.example.com;
    location / { proxy_pass http://unrelated_pool; }
}
NGINX
)
  out=$(printf '%s\n' "$nginx_cfg" | parse_nginx -)
  for keep in "server_name app.st.donehai.com" "proxy_pass http://st_web" "upstream st_web" "server 127.0.0.1:8080" \
    "server_name api.st.donehai.com" "location /api/" "proxy_pass http://127.0.0.1:3001" "listen 443 ssl http2"; do
    expect_has nginx "$out" "$keep"
  done
  for keep in unrelated 9999 ssl_certificate letsencrypt include auth_basic htpasswd Authorization ZmFrZ; do
    expect_not nginx "$out" "$keep"
  done

  # Caddy: matching site blocks, reverse_proxy targets only.
  local caddy_cfg
  caddy_cfg=$(cat <<'CADDY'
{
    email admin@example.com
}
(common) {
    header_up Authorization "Bearer fakefakefake"
}
app.st.donehai.com {
    import common
    basicauth {
        admin JDJhJDE0JGZha2VoYXNo
    }
    reverse_proxy 127.0.0.1:8080
}
https://api.st.donehai.com {
    reverse_proxy 127.0.0.1:3001 {
        header_up X-Api-Key fakevalue
    }
}
unrelated.example.com {
    reverse_proxy 127.0.0.1:9999
}
CADDY
)
  out=$(printf '%s\n' "$caddy_cfg" | parse_caddy -)
  for keep in "site app.st.donehai.com" "reverse_proxy 127.0.0.1:8080" "site https://api.st.donehai.com" "reverse_proxy 127.0.0.1:3001"; do
    expect_has caddy "$out" "$keep"
  done
  for keep in unrelated 9999 email Authorization basicauth JDJh X-Api-Key fakevalue import; do
    expect_not caddy "$out" "$keep"
  done

  # cloudflared: matching ingress hostname/service pairs only.
  local cfd_cfg
  cfd_cfg=$(cat <<'CFD'
tunnel: 00000000-0000-0000-0000-000000000000
credentials-file: /etc/cloudflared/00000000-0000-0000-0000-000000000000.json
ingress:
  - hostname: app.st.donehai.com
    service: http://localhost:8080
  - hostname: api.st.donehai.com
    service: http://localhost:3001
    originRequest:
      noTLSVerify: true
  - hostname: unrelated.example.com
    service: http://localhost:9999
  - service: http_status:404
CFD
)
  out=$(printf '%s\n' "$cfd_cfg" | parse_cloudflared -)
  for keep in "ingress hostname: app.st.donehai.com" "service: http://localhost:8080" "ingress hostname: api.st.donehai.com" "service: http://localhost:3001"; do
    expect_has cloudflared "$out" "$keep"
  done
  for keep in tunnel credentials 00000000 unrelated 9999 http_status noTLSVerify; do
    expect_not cloudflared "$out" "$keep"
  done

  # Apache: matching VirtualHost ProxyPass lines only.
  local apache_cfg
  apache_cfg=$(cat <<'APACHE'
<VirtualHost *:443>
    ServerName app.st.donehai.com
    SSLCertificateKeyFile /etc/letsencrypt/live/x/privkey.pem
    RequestHeader set Authorization "Basic ZmFrZTpmYWtl"
    ProxyPass / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/
</VirtualHost>
<VirtualHost *:443>
    ServerName unrelated.example.com
    ProxyPass / http://127.0.0.1:9999/
</VirtualHost>
APACHE
)
  out=$(printf '%s\n' "$apache_cfg" | parse_apache -)
  for keep in "ServerName app.st.donehai.com" "ProxyPass / http://127.0.0.1:8080/"; do
    expect_has apache "$out" "$keep"
  done
  for keep in unrelated 9999 SSLCertificate privkey Authorization; do
    expect_not apache "$out" "$keep"
  done

  # Traefik labels: matching router rule, service, entrypoints, port.
  out=$(printf '%s\n' '/st-web' \
    '  traefik.enable=true' \
    '  traefik.http.routers.stweb.rule=Host(`app.st.donehai.com`)' \
    '  traefik.http.routers.stweb.entrypoints=websecure' \
    '  traefik.http.routers.stweb.middlewares=auth' \
    '  traefik.http.middlewares.auth.basicauth.users=admin:$$apr1$$fakehash' \
    '  traefik.http.services.stweb.loadbalancer.server.port=80' | parse_traefik_labels)
  for keep in "--- container /st-web" "routers.stweb.rule=Host(\`app.st.donehai.com\`)" "routers.stweb.entrypoints=websecure" "loadbalancer.server.port=80"; do
    expect_has traefik "$out" "$keep"
  done
  for keep in basicauth middlewares apr1; do
    expect_not traefik "$out" "$keep"
  done
  out=$(printf '%s\n' '/other' '  traefik.http.routers.o.rule=Host(`unrelated.example.com`)' | parse_traefik_labels)
  checks=$((checks + 1))
  [ -z "$out" ] || { fails=$((fails + 1)); printf 'FAIL traefik: unrelated router printed\n%s\n' "$out"; }

  # Tokens embedded in routing paths, query strings and Traefik matchers.
  local tok="Zx9""Kq2Lm7""Wp4Rt8" toklc="abcd1234""efgh5678" hdr="X-Internal""-Key"
  out=$(printf '%s\n' \
    'server {' '    server_name api.st.donehai.com;' \
    "    location /webhook/$tok { proxy_pass http://127.0.0.1:3000/hooks/$toklc?key=$tok; }" \
    "    location = /cb/$toklc { proxy_pass http://user:$tok@127.0.0.1:3000; }" \
    '    location /api/v1/ { proxy_pass http://127.0.0.1:3001/; }' '}' | parse_nginx -)
  for keep in "location /webhook/[MASKED]" "proxy_pass http://127.0.0.1:3000/hooks/[MASKED]?[MASKED]" \
    "location = /cb/[MASKED]" "proxy_pass http://127.0.0.1:3000" "location /api/v1/" "proxy_pass http://127.0.0.1:3001/"; do
    expect_has nginx-path "$out" "$keep"
  done
  for keep in "$tok" "$toklc" user; do expect_not nginx-path "$out" "$keep"; done

  out=$(printf '%s\n' 'api.st.donehai.com {' "    handle /hook/$tok* {" "        reverse_proxy 127.0.0.1:3000" '    }' '}' | parse_caddy -)
  expect_has caddy-path "$out" "handle /hook/[MASKED]"
  expect_has caddy-path "$out" "reverse_proxy 127.0.0.1:3000"
  expect_not caddy-path "$out" "$tok"

  out=$(printf '%s\n' 'ingress:' '  - hostname: api.st.donehai.com' "    service: http://localhost:3000/$toklc" | parse_cloudflared -)
  expect_has cloudflared-path "$out" "service: http://localhost:3000/[MASKED]"
  expect_not cloudflared-path "$out" "$toklc"

  out=$(printf '%s\n' '<VirtualHost *:443>' '    ServerName api.st.donehai.com' \
    "    ProxyPass \"/hook/$tok\" \"http://127.0.0.1:3000/$toklc\"" '</VirtualHost>' | parse_apache -)
  expect_has apache-path "$out" "ProxyPass /hook/[MASKED] http://127.0.0.1:3000/[MASKED]"
  expect_not apache-path "$out" "$tok"
  expect_not apache-path "$out" "$toklc"

  out=$(printf '%s\n' '/st-api' \
    "  traefik.http.routers.stapi.rule=Host(\`api.st.donehai.com\`) && Headers(\`$hdr\`, \`$tok\`) && PathPrefix(\`/hook/$toklc\`)" \
    '  traefik.http.routers.stapi.service=stapi' | parse_traefik_labels)
  for keep in "routers.stapi.rule=Host(\`api.st.donehai.com\`)" "PathPrefix(\`/hook/[MASKED]\`)" "[only Host/Path matchers shown]" "routers.stapi.service=stapi"; do
    expect_has traefik-rule "$out" "$keep"
  done
  for keep in "$tok" "$toklc" "$hdr" Headers; do expect_not traefik-rule "$out" "$keep"; done
  out=$(printf '%s\n' '/st-mixed' "  traefik.http.routers.m.rule=Host(\`app.st.donehai.com\`,\`internal-$toklc.example.com\`)" | parse_traefik_labels)
  expect_has traefik-rule "$out" "Host(\`app.st.donehai.com\`,\`[other host]\`)"
  expect_not traefik-rule "$out" "$toklc"

  printf 'self-test: %s checks, %s failures\n' "$checks" "$fails"
  [ "$fails" -eq 0 ]
}

main() {
  echo 'DoneHai ST VPS discovery - read-only report. Secrets are redacted (best effort); review before sharing.'
  report_host
  report_access
  report_ports
  report_proxy_processes
  report_proxy_host_configs
  report_proxy_containers
  report_tls
  report_docker
  report_health
  report_repo
  section "END"
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit $?
fi

main 2>&1 | redact
