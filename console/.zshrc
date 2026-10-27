# ═══════════════════════════════════════════════════════════
#  Alice-App · красивая консоль для Станции Лайт
#  zsh + Powerlevel10k + autosuggestions + syntax-highlighting
# ═══════════════════════════════════════════════════════════

# --- пути: свои бинарники впереди системных ---
export PATH="/data/opt/bin:/opt/sbin:/opt/bin:/system/vendor/quasar:$PATH"
export EDITOR=nano
export VISUAL=nano
export TERM="${TERM:-xterm-256color}"

# --- мгновенный prompt p10k (загружается до остального) ---
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# --- тема и плагины ---
[[ -f /data/opt/zsh/powerlevel10k/powerlevel10k.zsh-theme ]] && \
  source /data/opt/zsh/powerlevel10k/powerlevel10k.zsh-theme
[[ -f ~/.p10k.zsh ]] && source ~/.p10k.zsh
[[ -f /data/opt/zsh/zsh-autosuggestions/zsh-autosuggestions.zsh ]] && \
  source /data/opt/zsh/zsh-autosuggestions/zsh-autosuggestions.zsh
[[ -f /data/opt/zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]] && \
  source /data/opt/zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# --- история ---
HISTFILE=$HOME/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt SHARE_HISTORY HIST_IGNORE_ALL_DUPS HIST_REDUCE_BLANKS EXTENDED_HISTORY

# --- удобство ---
setopt AUTO_CD AUTO_PUSHD PUSHD_IGNORE_DUPS
bindkey '^[[A' history-search-backward
bindkey '^[[B' history-search-forward

# --- алиасы ---
alias ls='ls --color=auto'
alias ll='ls -lah'
alias la='ls -A'
alias grep='grep --color=auto'
alias ..='cd ..'
alias ...='cd ../..'
alias df='df -h'
alias free='free -m'
alias ports='netstat -lntp 2>/dev/null || ss -lntp'
alias k='kill -9'
alias q='exit'
alias reload='source ~/.zshrc'

# --- быстрый доступ к инструментам колонки ---
alias yse='yse'
alias led='/data/opt/alice/led.sh'
alias alice-api='/data/opt/alice/api.sh'

# --- сводка системы при входе (только в интерактивной сессии) ---
if [[ -o interactive ]] && command -v fastfetch >/dev/null 2>&1; then
  fastfetch --logo-type small 2>/dev/null || fastfetch
fi
