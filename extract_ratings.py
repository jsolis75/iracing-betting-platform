import json
import os

def extract_ratings():
    input_file = 'src/data/driver_stats.json'
    output_file = 'src/data/winstel_ratings_map.json'
    
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found")
        return

    print(f"Reading {input_file}...")
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        ratings_map = {}
        for member_id, stats in data.items():
            name = stats.get('name')
            # Assuming 'iRating' exists in the stats object based on usual iRacing data structures
            # or it might be under 'ovalRating' / 'roadRating'
            # Let's check for common rating keys
            irating = stats.get('iRating') or stats.get('ovalRating') or stats.get('rating')
            if name and irating is not None:
                ratings_map[name.lower()] = irating
        
        print(f"Found {len(ratings_map)} drivers with ratings.")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(ratings_map, f, indent=4)
        print(f"Saved mapping to {output_file}")
            
    except Exception as e:
        print(f"Error processing file: {e}")

if __name__ == '__main__':
    extract_ratings()
