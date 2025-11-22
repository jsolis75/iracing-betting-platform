import csv
import json
import os

def convert_csv_to_json():
    csv_path = os.path.join('iracerdata', 'Oval_driver_stats.csv')
    json_path = os.path.join('src', 'data', 'driver_stats.json')
    
    print(f"Reading from {csv_path}...")
    
    stats_map = {}
    count = 0
    
    try:
        # Use utf-8-sig to handle BOM if present
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            
            print(f"CSV Headers: {reader.fieldnames}")
            
            for row in reader:
                # Use CUSTID as key
                cust_id = row.get('CUSTID')
                driver_name = row.get('DRIVER')
                
                if not cust_id:
                    continue
                    
                try:
                    # Parse metrics safely
                    avg_inc = float(row.get('AVG_INC', 3.0))
                    starts = int(row.get('STARTS', 0))
                    wins = int(row.get('WINS', 0))
                    avg_points = float(row.get('AVG_POINTS', 50))
                    top25pcnt = int(row.get('TOP25PCNT', 0))
                    license_class = row.get('CLASS', '')
                    
                    stats_map[cust_id] = {
                        'name': driver_name,
                        'avgIncidents': avg_inc,
                        'starts': starts,
                        'wins': wins,
                        'avgPoints': avg_points,
                        'top25Percent': top25pcnt,
                        'winPercentage': (wins / starts * 100) if starts > 0 else 0,
                        'avgFinish': 0, # Not in CSV
                        'licenseClass': license_class
                    }
                    count += 1
                    
                    # Debug: Check for Ryan Moyer
                    if 'Moyer' in driver_name:
                        print(f"Found Moyer: {driver_name} (ID: {cust_id})")
                        
                except ValueError as e:
                    # print(f"Skipping row due to error: {e}")
                    continue
                    
        print(f"Processed {count} drivers.")
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        
        print(f"Writing to {json_path}...")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(stats_map, f)
            
        print("Done!")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    convert_csv_to_json()
