import irsdk
import json
import os
import time
from datetime import datetime

# Initialize iRacing SDK
ir = irsdk.IRSDK()

def fetch_live_data():
    print("Waiting for iRacing to connect...")
    
    # Wait for connection
    while not ir.startup():
        time.sleep(1)

    print("Connected to iRacing!")
    print("Starting live data stream... (Press Ctrl+C to stop)")
    
    try:
        last_lap_count = -1
        
        while True:
            # Freeze the buffer to get a consistent snapshot
            ir.freeze_var_buffer_latest()
            
            # Fetch the specific sections we need
            weekend_info = ir['WeekendInfo'] or {}
            session_info = ir['SessionInfo'] or {}
            driver_info = ir['DriverInfo'] or {}
            
            # Fetch live telemetry variables
            session_flags = ir['SessionFlags']
            session_state = ir['SessionState']
            session_laps_remain = ir['SessionLapsRemain']
            session_time_remain = ir['SessionTimeRemain']
            
            # Combine into one structure
            data = {
                "WeekendInfo": weekend_info,
                "SessionInfo": session_info,
                "DriverInfo": driver_info,
                "Telemetry": {
                    "SessionFlags": session_flags,
                    "SessionState": session_state,
                    "SessionLapsRemain": session_laps_remain,
                    "SessionTimeRemain": session_time_remain
                }
            }
            
            # Save to JSON file in the src/data directory (consumed by API route)
            output_file = 'src/data/iracing-sample.json'
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(output_file), exist_ok=True)
            
            # Write to a temp file first to ensure atomic update
            temp_file = output_file + '.tmp'
            with open(temp_file, 'w') as f:
                json.dump(data, f, indent=2)
                # Force write to disk
                f.flush()
                os.fsync(f.fileno())
            
            # Rename temp file to actual file (atomic on POSIX, atomic-ish on Windows with os.replace)
            # Retry logic for Windows file locking issues
            max_retries = 5
            for attempt in range(max_retries):
                try:
                    os.replace(temp_file, output_file)
                    break
                except PermissionError:
                    if attempt < max_retries - 1:
                        time.sleep(0.1)
                    else:
                        print(f"\n⚠️ Failed to write file after {max_retries} attempts due to lock.")
            
            # Only print update message if something changed or periodically
            current_time = datetime.now().strftime('%H:%M:%S')
            print(f"\r✅ Live Update {current_time} | Laps Rem: {session_laps_remain} | Flags: {session_flags}", end="")
            
            # Sleep for 1 second before next update
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n\n🛑 Data fetching stopped by user.")
        
    except Exception as e:
        print(f"\nError fetching data: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        ir.shutdown()

if __name__ == "__main__":
    fetch_live_data()
