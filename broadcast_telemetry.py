import irsdk
import json
import time
import requests
from datetime import datetime

# Configuration
API_URL = "https://iracingbets.com/api/telemetry/ingest"
# API_URL = "https://www.iracingbets.com/api/telemetry/ingest" # Production URL
API_KEY = "iracing-broadcast-key-123" # Simple protection

# Initialize iRacing SDK
ir = irsdk.IRSDK()

def broadcast_data():
    print("🏎️  iRacing Telemetry Broadcaster")
    print(f"📡 Target: {API_URL}")
    print("--------------------------------")
    print("Waiting for iRacing to connect... (Make sure you are in the SIM, not just the UI)")
    
    attempt = 0
    while True:
        # Check connection
        if not ir.startup():
            attempt += 1
            if attempt % 5 == 0:
                print(f"\r⏳ Still waiting for iRacing... ({attempt}s)", end="")
            time.sleep(1)
            continue

        # Once connected
        print("✅ Connected to iRacing! Broadcasting data...")
        
        try:
            while True:
                # Freeze buffer
                ir.freeze_var_buffer_latest()
                
                # 1. Collect Data
                data = {
                    "WeekendInfo": ir['WeekendInfo'] or {},
                    "SessionInfo": ir['SessionInfo'] or {},
                    "DriverInfo": ir['DriverInfo'] or {},
                    "Telemetry": {
                        "SessionFlags": ir['SessionFlags'],
                        "SessionState": ir['SessionState'],
                        "SessionLapsRemain": ir['SessionLapsRemain'],
                        "SessionTimeRemain": ir['SessionTimeRemain']
                    },
                    "BroadcastTime": time.time()
                }
                
                # 2. Send to API
                try:
                    response = requests.post(
                        API_URL, 
                        json=data,
                        headers={"x-api-key": API_KEY},
                        timeout=5
                    )
                    
                    if response.status_code == 200:
                        print(f"\r📡 Sent update: {datetime.now().strftime('%H:%M:%S')} | Flags: {data['Telemetry']['SessionFlags']}", end="")
                    else:
                        print(f"\n⚠️ API Error {response.status_code}: {response.text}")
                        
                except Exception as req_err:
                    print(f"\n⚠️ Connection Error: {req_err}")
                
                # Rate limit (1 second is good for free tier)
                time.sleep(1)
                
        except KeyboardInterrupt:
            print("\n\n🛑 Broadcasting stopped.")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")
            time.sleep(5) # Wait before reconnecting
            
if __name__ == "__main__":
    broadcast_data()
