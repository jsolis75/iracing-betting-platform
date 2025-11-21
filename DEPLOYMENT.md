# Quick Deployment Guide

## Step 1: Setup Database (Vercel Postgres)

1. Go to https://vercel.com/dashboard
2. Create new Postgres database
3. Copy connection string
4. Run the SQL schema from `deployment_plan.md`

## Step 2: Setup VPS (DigitalOcean)

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Run setup script
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt update && apt upgrade -y
apt install -y nodejs python3 python3-pip nginx certbot python3-certbot-nginx
npm install -g pm2

# Create user
adduser iracing
usermod -aG sudo iracing
su - iracing
```

## Step 3: Deploy Backend

```bash
# On your VPS (as iracing user)
cd ~
git clone https://github.com/YOUR_USERNAME/iracing-betting-platform.git
cd iracing-betting-platform/backend

# Install dependencies
npm install

# Create .env file
nano .env
# Paste your DATABASE_URL and other variables

# Start with PM2
pm2 start server.js --name iracing-api
pm2 startup
pm2 save
```

## Step 4: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/iracing-api
```

Paste this configuration:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/iracing-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 5: Setup SSL

```bash
sudo certbot --nginx -d api.yourdomain.com
```

## Step 6: Deploy Frontend (Vercel)

```bash
# In your local project root
git add .
git commit -m "Production ready"
git push origin main
```

In Vercel dashboard:
1. Import project from GitHub
2. Add environment variables:
   - `DATABASE_URL` = Your Postgres connection string
   - `NEXT_PUBLIC_API_URL` = https://api.yourdomain.com

## Step 7: Configure Domain (GoDaddy)

Add these DNS records:

| Type | Name | Value |
|------|------|-------|
| A | @ | 76.76.21.21 |
| CNAME | www | cname.vercel-dns.com |
| A | api | YOUR_VPS_IP |

## Step 8: Test

- Frontend: https://yourdomain.com
- Backend: https://api.yourdomain.com/health
- Database: Check Vercel dashboard

## Monitoring

```bash
# Check backend logs
pm2 logs iracing-api

# Check backend status
pm2 status

# Restart backend
pm2 restart iracing-api
```

## Updating

```bash
# Backend updates
cd ~/iracing-betting-platform/backend
git pull
npm install
pm2 restart iracing-api

# Frontend updates
# Just push to GitHub, Vercel auto-deploys
```

## Costs

- Domain (GoDaddy): ~$12-15/year
- VPS (DigitalOcean): $12/month
- Database (Vercel): Free tier (upgrade if needed)
- **Total**: ~$12-15/month + domain
