"""
Alternative authentication test - trying different methods
"""
from iracingdataapi.client import irDataClient
import hashlib
import base64
import os
from dotenv import load_dotenv

# Load credentials from .env file
load_dotenv()
IRACING_EMAIL = os.getenv('IRACING_EMAIL')
IRACING_PASSWORD = os.getenv('IRACING_PASSWORD')

if not IRACING_EMAIL or not IRACING_PASSWORD:
    print("ERROR: Please create a .env file with IRACING_EMAIL and IRACING_PASSWORD")
    print("See .env.example for the format")
    exit(1)

print("Testing different authentication methods...")
print("=" * 60)

# Method 1: Plain credentials
print("\n1. Testing with plain credentials...")
try:
    idc = irDataClient(username=IRACING_EMAIL, password=IRACING_PASSWORD)
    print("   Client created successfully")
    result = idc.stats_member_summary()
    if result:
        print("   ✓ SUCCESS!")
    else:
        print("   ✗ No data returned")
except Exception as e:
    print(f"   ✗ Failed: {str(e)[:100]}")

# Method 2: Try with encoded password (base64)
print("\n2. Testing with base64 encoded password...")
try:
    encoded_pw = base64.b64encode(IRACING_PASSWORD.encode()).decode()
    idc = irDataClient(username=IRACING_EMAIL, password=encoded_pw)
    result = idc.stats_member_summary()
    if result:
        print("   ✓ SUCCESS with base64!")
    else:
        print("   ✗ No data returned")
except Exception as e:
    print(f"   ✗ Failed: {str(e)[:100]}")

# Method 3: Check if library has a login method
print("\n3. Checking for alternative login methods...")
try:
    idc = irDataClient()
    # Check what methods are available
    methods = [m for m in dir(idc) if not m.startswith('_')]
    print(f"   Available methods: {len(methods)}")
    
    # Look for login-related methods
    login_methods = [m for m in methods if 'login' in m.lower() or 'auth' in m.lower()]
    if login_methods:
        print(f"   Found login methods: {login_methods}")
    else:
        print("   No explicit login methods found")
        
except Exception as e:
    print(f"   ✗ Error: {e}")

print("\n" + "=" * 60)
print("\nDEBUGGING INFO:")
print("If all methods failed, please check:")
print("1. Are you using your iRacing.com login email (not username)?")
print("2. Is 2FA enabled? (This might block API access)")
print("3. Can you log into members.iracing.com with these credentials?")
print("4. Try resetting your iRacing password and use the new one")
print("\nIf nothing works, we can use iRating-based estimation instead.")
