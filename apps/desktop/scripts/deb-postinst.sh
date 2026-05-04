#!/bin/bash
# Grant CAP_NET_RAW capability to the pruftnet binary.
# This allows raw socket access for network scanning without running the
# entire application as root. X11 display issues and --no-sandbox are avoided.
if command -v setcap >/dev/null 2>&1; then
    setcap cap_net_raw+ep /usr/lib/pruftnet/pruftnet || true
fi
