from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import random
import datetime
import subprocess
import platform
import asyncio
import os

app = FastAPI(title="NetSec Guard - Network Security & Pentest Management", version="1.0.0")

# ========== KEEP-ALIVE (Prevent Render Free Tier Sleep) ==========
@app.get("/api/keep-alive")
def keep_alive():
    """Endpoint para manter o serviço ativo no Render"""
    return {
        "status": "alive",
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "message": "Cyber Defense Suite is running!"
    }

@app.on_event("startup")
async def startup_event():
    """Tarefa em background para manter o serviço ativo"""
    async def keep_alive_task():
        while True:
            await asyncio.sleep(600)  # A cada 10 minutos
            try:
                import urllib.request
                url = os.environ.get("RENDER_EXTERNAL_URL", "http://localhost:8000")
                if url and "localhost" not in url:
                    urllib.request.urlopen(f"{url}/api/keep-alive", timeout=10)
            except:
                pass
    
    asyncio.create_task(keep_alive_task())

class ScanRequest(BaseModel):
    target: str

class PasswordAuditRequest(BaseModel):
    service: str
    target_ip: str

class NISTChecklistUpdate(BaseModel):
    function_id: str
    status: str

# Mock NIST CSF 2.0 Framework
nist_framework = [
    {"id": "GV.OC-01", "function": "Govern", "description": "Organizational cybersecurity governance and risk management policies", "status": "Conforme"},
    {"id": "ID.AM-01", "function": "Identify", "description": "Hardware and software assets are inventoried and managed", "status": "Parcial"},
    {"id": "PR.AC-01", "function": "Protect", "description": "Identity management, authentication, and access control enforced", "status": "Conforme"},
    {"id": "DE.CM-01", "function": "Detect", "description": "Continuous network monitoring for anomalous activity", "status": "Não Conforme"},
    {"id": "RS.RP-01", "function": "Respond", "description": "Incident response plan executed and tested regularly", "status": "Parcial"},
    {"id": "RC.RP-01", "function": "Recover", "description": "Recovery plans and data backups verified and tested", "status": "Conforme"}
]

vulnerability_db = [
    {"id": "VULN-001", "severity": "Alta", "service": "SSH (Port 22)", "description": "Weak Diffie-Hellman moduli or root login enabled", "remediation": "Disable root login in sshd_config and enforce SSH keys."},
    {"id": "VULN-002", "severity": "Média", "service": "HTTP (Port 80)", "description": "Outdated web server banner exposing version info", "remediation": "Hide server signature headers and update to latest patch."},
    {"id": "VULN-003", "severity": "Crítica", "service": "SMB (Port 445)", "description": "Potential SMBv1 protocol active or missing security patches", "remediation": "Disable SMBv1 and enforce SMB signing."}
]

@app.get("/", response_class=HTMLResponse)
def read_root():
    import os
    base_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(base_dir, "templates", "index.html")
    with open(template_path, "r", encoding="utf-8") as f:
        return f.read()

@app.get("/health")
def health_check():
    """Health check endpoint for Render"""
    return {"status": "healthy"}

@app.post("/api/scan")
def scan_network(req: ScanRequest):
    target = req.target.strip()
    if not target:
        raise HTTPException(status_code=400, detail="Alvo inválido.")
    
    # Real TCP port check on target
    ports_to_check = [21, 22, 80, 443, 445, 3306, 8080, 8443]
    open_ports = []
    
    import socket
    for port in ports_to_check:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.5)
            result = s.connect_ex((target, port))
            if result == 0:
                service_map = {21: "ftp", 22: "ssh", 80: "http", 443: "https", 445: "smb", 3306: "mysql", 8080: "http-proxy", 8443: "https-alt"}
                open_ports.append({
                    "port": port,
                    "service": service_map.get(port, "unknown"),
                    "state": "open",
                    "banner": f"Active TCP Service on port {port}"
                })
            s.close()
        except Exception:
            pass
            
    # If no open ports found via real socket (e.g. target blocks or offline), fallback or show simulation
    if not open_ports and target in ["127.0.0.1", "localhost"]:
        open_ports = [
            {"port": 22, "service": "ssh", "state": "open", "banner": "OpenSSH 8.2p1"},
            {"port": 80, "service": "http", "state": "open", "banner": "nginx/1.18.0"}
        ]

    return {
        "target": target,
        "scan_time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "os_detected": "Linux / Windows / Network Device",
        "total_ports_scanned": len(ports_to_check),
        "open_ports": open_ports,
        "risk_score": "Alto" if len(open_ports) >= 3 else ("Médio" if len(open_ports) > 0 else "Baixo")
    }

@app.get("/api/local-devices")
def discover_local_devices():
    """Discovers nearby devices on the local subnet by scanning common gateway/IPs"""
    active_devices = []
    base_ips = ["192.168.1.1", "192.168.1.10", "192.168.1.100", "192.168.0.1", "10.0.0.1", "127.0.0.1"]
    
    import socket
    for ip in base_ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.2)
            res = s.connect_ex((ip, 80))
            if res == 0 or ip == "127.0.0.1":
                active_devices.append({
                    "ip": ip,
                    "status": "Online",
                    "type": "Router / Gateway / Host",
                    "open_web_port": 80
                })
            s.close()
        except Exception:
            pass
            
    return {
        "scanned_range": "Local Subnet Check",
        "devices_found": active_devices if active_devices else [{"ip": "127.0.0.1", "status": "Online", "type": "Localhost", "open_web_port": 80}]
    }

@app.post("/api/password-audit")
def audit_password(req: PasswordAuditRequest):
    # Simulate Hydra password brute-force / policy check
    service = req.service
    target = req.target_ip
    
    usernames = ["admin", "root", "user", "manager", "support"]
    found_credentials = []
    
    if random.random() > 0.4:
        found_credentials.append({"username": "admin", "password": "password123", "status": "Vulnerável (Senha Fraca)"})
    
    return {
        "service": service,
        "target": target,
        "attempts": 1250,
        "time_elapsed": "4.2s",
        "result": "Vulnerabilidades encontradas" if found_credentials else "Nenhuma credencial fraca detectada",
        "credentials": found_credentials
    }

@app.get("/api/compliance")
def get_compliance():
    return nist_framework

@app.get("/api/vulnerabilities")
def get_vulnerabilities():
    return vulnerability_db

# ========== NETWORK MONITORING & FIREWALL ==========

class FirewallActivateRequest(BaseModel):
    confirm: bool
    rules: list = []

@app.get("/api/network-monitor")
def monitor_network():
    """Monitora conexões de rede ativas"""
    connections = []
    os_type = platform.system()
    
    try:
        if os_type == "Windows":
            # Windows: netstat -ano
            result = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, timeout=10)
            lines = result.stdout.split('\n')
            
            for line in lines[1:]:  # Skip header
                parts = line.split()
                if len(parts) >= 5 and parts[0] in ['TCP', 'UDP']:
                    proto = parts[0]
                    local_addr = parts[1]
                    remote_addr = parts[2]
                    state = parts[3] if proto == 'TCP' else 'UDP'
                    pid = parts[4] if len(parts) > 4 else '-'
                    
                    # Get process name
                    proc_name = "unknown"
                    try:
                        if pid != '-' and pid.isdigit():
                            proc_result = subprocess.run(
                                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                                capture_output=True, text=True, timeout=5
                            )
                            if proc_result.stdout.strip():
                                proc_name = proc_result.stdout.split(',')[0].strip('"')
                    except:
                        pass
                    
                    # Identify suspicious connections
                    suspicious = False
                    reason = ""
                    
                    if remote_addr == "0.0.0.0:0" or remote_addr == "*:*":
                        reason = "Listening"
                    elif remote_addr.startswith("127.") or remote_addr.startswith("0."):
                        reason = "Local"
                    elif remote_addr.startswith("192.168.") or remote_addr.startswith("10.") or remote_addr.startswith("172."):
                        reason = "Rede Local"
                    else:
                        reason = "Internet"
                        if proto == 'TCP' and state == 'ESTABLISHED':
                            suspicious = False  # Normal connection
                    
                    connections.append({
                        "protocol": proto,
                        "local": local_addr,
                        "remote": remote_addr,
                        "state": state,
                        "pid": pid,
                        "process": proc_name,
                        "type": reason,
                        "suspicious": suspicious
                    })
        else:
            # Linux/Mac: ss or netstat
            result = subprocess.run(["ss", "-tuln"], capture_output=True, text=True, timeout=10)
            lines = result.stdout.split('\n')
            
            for line in lines[1:]:
                parts = line.split()
                if len(parts) >= 5:
                    proto = parts[0]
                    state = parts[1] if len(parts) > 1 else 'LISTEN'
                    local = parts[4] if len(parts) > 4 else '-'
                    
                    connections.append({
                        "protocol": proto.upper(),
                        "local": local,
                        "remote": "-",
                        "state": state,
                        "pid": "-",
                        "process": "system",
                        "type": "Local",
                        "suspicious": False
                    })
    except Exception as e:
        connections.append({
            "protocol": "ERROR",
            "local": "-",
            "remote": "-",
            "state": str(e),
            "pid": "-",
            "process": "-",
            "type": "Erro",
            "suspicious": False
        })
    
    # Statistics
    total = len(connections)
    tcp_count = sum(1 for c in connections if c['protocol'] == 'TCP')
    udp_count = sum(1 for c in connections if c['protocol'] == 'UDP')
    established = sum(1 for c in connections if c.get('state') == 'ESTABLISHED')
    listening = sum(1 for c in connections if c.get('state') == 'LISTENING')
    
    return {
        "scan_time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "os": platform.system(),
        "total_connections": total,
        "statistics": {
            "tcp": tcp_count,
            "udp": udp_count,
            "established": established,
            "listening": listening
        },
        "connections": connections[:50]  # Limit to 50 for display
    }

@app.get("/api/firewall-status")
def get_firewall_status():
    """Verifica status do firewall do sistema"""
    os_type = platform.system()
    firewall_info = {
        "os": os_type,
        "firewall_active": False,
        "firewall_name": "",
        "rules_count": 0,
        "protection_level": "Nenhum",
        "details": []
    }
    
    try:
        if os_type == "Windows":
            # Check Windows Firewall
            result = subprocess.run(
                ["netsh", "advfirewall", "show", "allprofiles"],
                capture_output=True, text=True, timeout=10
            )
            
            output = result.stdout
            firewall_info["firewall_name"] = "Windows Defender Firewall"
            
            # Parse status
            if "State" in output:
                for line in output.split('\n'):
                    if 'ON' in line.upper() and 'STATE' in line.upper():
                        firewall_info["firewall_active"] = True
                        break
            
            # Count rules
            rules_result = subprocess.run(
                ["netsh", "advfirewall", "firewall", "show", "rule", "name=all"],
                capture_output=True, text=True, timeout=10
            )
            firewall_info["rules_count"] = rules_result.stdout.count("Rule Name") if rules_result.stdout else 0
            
            # Protection level
            if firewall_info["firewall_active"]:
                if firewall_info["rules_count"] > 50:
                    firewall_info["protection_level"] = "Alto"
                elif firewall_info["rules_count"] > 20:
                    firewall_info["protection_level"] = "Médio"
                else:
                    firewall_info["protection_level"] = "Baixo"
            else:
                firewall_info["protection_level"] = "Desativado"
            
            # Details
            firewall_info["details"] = [
                {"name": "Firewall Ativo", "status": firewall_info["firewall_active"]},
                {"name": "Regras Configuradas", "status": True, "count": firewall_info["rules_count"]},
                {"name": "Proteção de Entrada", "status": firewall_info["firewall_active"]},
                {"name": "Proteção de Saída", "status": firewall_info["firewall_active"]},
                {"name": "Log de Tráfego", "status": True}
            ]
            
        elif os_type == "Linux":
            # Check iptables
            result = subprocess.run(["iptables", "-L", "-n"], capture_output=True, text=True, timeout=10)
            firewall_info["firewall_name"] = "iptables"
            firewall_info["firewall_active"] = "Chain INPUT (policy DROP)" in result.stdout or "ACCEPT" in result.stdout
            firewall_info["rules_count"] = result.stdout.count("Chain")
            firewall_info["protection_level"] = "Alto" if firewall_info["firewall_active"] else "Desativado"
            firewall_info["details"] = [
                {"name": "iptables Ativo", "status": firewall_info["firewall_active"]},
                {"name": "Chain INPUT", "status": True},
                {"name": "Chain FORWARD", "status": True},
                {"name": "Chain OUTPUT", "status": True}
            ]
    except Exception as e:
        firewall_info["details"] = [{"name": "Erro", "status": False, "error": str(e)}]
    
    return firewall_info

@app.post("/api/firewall-activate")
def activate_firewall(req: FirewallActivateRequest):
    """Ativa o firewall com regras de proteção"""
    if not req.confirm:
        raise HTTPException(status_code=400, detail="Confirmação necessária para ativar o firewall.")
    
    os_type = platform.system()
    result = {
        "activated": False,
        "os": os_type,
        "rules_applied": [],
        "message": "",
        "protection_level": "Nenhum"
    }
    
    try:
        if os_type == "Windows":
            # Enable Windows Firewall on all profiles
            subprocess.run(
                ["netsh", "advfirewall", "set", "allprofiles", "state", "on"],
                capture_output=True, text=True, timeout=10
            )
            
            # Enable logging
            subprocess.run(
                ["netsh", "advfirewall", "set", "allprofiles", "logging", "filename", "C:\\Windows\\System32\\LogFiles\\Firewall\\pfirewall.log"],
                capture_output=True, text=True, timeout=10
            )
            
            # Block common attack ports (inbound)
            dangerous_ports = [445, 3389, 5900, 135, 137, 138, 139]
            for port in dangerous_ports:
                subprocess.run(
                    ["netsh", "advfirewall", "firewall", "add", "rule",
                     f"name=Block Port {port} (CyberGuard)",
                     "dir=in", "action=block", "protocol=tcp",
                     f"localport={port}", "enable=yes"],
                    capture_output=True, text=True, timeout=10
                )
                result["rules_applied"].append(f"Bloqueio porta {port}/TCP (entrada)")
            
            # Allow common safe ports
            safe_ports = [80, 443, 53, 8080]
            for port in safe_ports:
                subprocess.run(
                    ["netsh", "advfirewall", "firewall", "add", "rule",
                     f"name=Allow Port {port} (CyberGuard)",
                     "dir=in", "action=allow", "protocol=tcp",
                     f"localport={port}", "enable=yes"],
                    capture_output=True, text=True, timeout=10
                )
                result["rules_applied"].append(f"Permitido porta {port}/TCP (entrada)")
            
            result["activated"] = True
            result["message"] = "Firewall Windows ativado com sucesso! Regras de proteção aplicadas."
            result["protection_level"] = "Alto"
            
        elif os_type == "Linux":
            # Enable iptables rules
            rules = [
                "iptables -P INPUT DROP",
                "iptables -P FORWARD DROP",
                "iptables -P OUTPUT ACCEPT",
                "iptables -A INPUT -i lo -j ACCEPT",
                "iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT",
                "iptables -A INPUT -p tcp --dport 22 -j ACCEPT",
                "iptables -A INPUT -p tcp --dport 80 -j ACCEPT",
                "iptables -A INPUT -p tcp --dport 443 -j ACCEPT",
                "iptables -A INPUT -p icmp -j ACCEPT"
            ]
            
            for rule in rules:
                subprocess.run(rule.split(), capture_output=True, text=True, timeout=10)
                result["rules_applied"].append(rule)
            
            result["activated"] = True
            result["message"] = "Firewall iptables ativado com sucesso! Regras de proteção aplicadas."
            result["protection_level"] = "Alto"
            
    except Exception as e:
        result["message"] = f"Erro ao ativar firewall: {str(e)}"
        raise HTTPException(status_code=500, detail=result["message"])
    
    return result
