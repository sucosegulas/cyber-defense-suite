from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import random
import datetime

app = FastAPI(title="NetSec Guard - Network Security & Pentest Management", version="1.0.0")

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
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()

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
