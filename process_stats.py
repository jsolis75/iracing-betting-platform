import csv
import json
import os

def process_stats():
    csv_path = os.path.join('iracerdata', 'Oval_driver_stats.csv')
    json_path = os.path.join('src', 'data', 'driver_stats.json')
    
    print(f"Reading from {csv_path}...")
    
    stats_map = {}
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                cust_id = row['CUSTID']
                if not cust_id:
                    continue
                    
                # Parse metrics
                try:
                    starts = int(row['STARTS'])
                    wins = int(row['WINS'])
                    avg_points = int(row['AVG_POINTS'])
                    avg_inc = float(row['AVG_INC'])
                    avg_finish = int(row['AVG_FINISH_POS'])
                    top25pcnt = int(row['TOP25PCNT'])
                    
                    stats_map[cust_id] = {
                        'starts': starts,
                        'wins': wins,
                        'avgPoints': avg_points,
                        'avgIncidents': avg_inc,
                        'avgFinish': avg_finish,
                        'top25Percent': top25pcnt,
                        'winPercentage': (wins / starts * 100) if starts > 0 else 0
                    }
                except ValueError:
                    continue
                    
        print(f"Processed {len(stats_map)} drivers.")
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(stats_map, f)
            
        print(f"Saved to {json_path}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    process_stats()
