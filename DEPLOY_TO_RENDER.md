# Deploy Ephemeral Chat to Render

## Quick Start Guide

### Prerequisites
- GitHub repository (already set up: https://github.com/samranjithpaul/ephemeral-chat.git)
- Upstash Redis account (free tier available) or any Redis provider
- Render account (free tier available)

---

## Step 1: Setup Redis (Upstash Recommended)

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database
3. Copy the **Redis URL** (format: `rediss://default:TOKEN@HOST:PORT`)
4. Or use the REST URL and token if preferred

**Alternative**: Use any Redis provider (Redis Cloud, AWS ElastiCache, etc.)

---

## Step 2: Deploy to Render

### Option A: Using Render Dashboard (Recommended)

1. **Sign up/Login** to [Render](https://render.com)
2. **New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select `samranjithpaul/ephemeral-chat`

3. **Configure Service**
   - **Name**: `ephemeral-chat` (or your choice)
   - **Environment**: `Node`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your deployment branch)
   - **Root Directory**: `.` (leave empty)
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

4. **Environment Variables**
   Add these in the Render dashboard:
   ```
   NODE_ENV=production
   REDIS_URL=rediss://default:YOUR_TOKEN@YOUR_HOST:6379
   ```
   
   **Note**: `PORT` is automatically set by Render - do NOT set it manually.
   
   Optional (for file sharing):
   ```
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   AWS_REGION=us-east-1
   AWS_S3_BUCKET=your_bucket
   ```

5. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy automatically
   - Wait ~2-3 minutes for first deployment

6. **Get Your URL**
   - Your app will be available at: `https://your-app-name.onrender.com`
   - WebSocket connections work automatically!

### Option B: Using render.yaml (Advanced)

Create `render.yaml` in your project root:

```yaml
services:
  - type: web
    name: ephemeral-chat
    env: node
    plan: starter  # $7/month, or free for testing
    region: oregon  # or your preferred region
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      # PORT is automatically set by Render - don't set it manually
      - key: REDIS_URL
        sync: false  # Set manually in dashboard
      - key: AWS_ACCESS_KEY_ID
        sync: false
      - key: AWS_SECRET_ACCESS_KEY
        sync: false
      - key: AWS_REGION
        value: us-east-1
      - key: AWS_S3_BUCKET
        sync: false
```

Then in Render dashboard:
1. New → Blueprint
2. Connect your repo
3. Render will detect `render.yaml` automatically

---

## Step 3: Verify Deployment

### Check Logs
1. Go to your service in Render dashboard
2. Click "Logs" tab
3. Look for:
   - ✅ `✅ Connected to Redis`
   - ✅ `serving on port 10000`
   - ❌ No errors

### Test WebSocket Connection
1. Open your app URL
2. Open browser DevTools → Network → WS
3. You should see WebSocket connection established
4. Try joining a room - should work in real-time

---

## Step 4: Custom Domain (Optional)

1. In Render dashboard → Settings
2. Add Custom Domain
3. Follow DNS configuration instructions
4. SSL certificate is automatic

---

## Troubleshooting

### Issue: App won't start / "No open ports detected"
- **Root Cause**: Server was binding to `localhost` instead of `0.0.0.0`
- **Fix**: ✅ **Already fixed!** The server now binds to `0.0.0.0` by default
- **Check logs**: Should see `serving on 0.0.0.0:PORT` (not `localhost`)
- **Don't set PORT manually**: Render sets it automatically - your code reads `process.env.PORT`
- **Verify**: Server listens on `0.0.0.0` (all interfaces), not `localhost` (local only)

### Issue: Redis connection fails
- **Verify** `REDIS_URL` is correct in environment variables
- **Check** Redis database is running
- **Test** connection string locally

### Issue: WebSocket not working
- **Ensure** you're on Starter plan ($7) or free tier (may have cold starts)
- **Check** browser console for WebSocket errors
- **Verify** CORS settings allow your domain

### Issue: Build fails
- **Check** build logs in Render dashboard
- **Verify** `package.json` has correct build script
- **Ensure** all dependencies are in `package.json` (not `devDependencies`)

---

## Cost Breakdown

### Free Tier (Testing)
- ⚠️ Spins down after 15 min inactivity
- ⚠️ Cold start ~30 seconds on wake-up
- ✅ Good for testing
- ✅ 750 hours/month

### Starter Plan ($7/month)
- ✅ Always-on (no cold starts)
- ✅ Perfect for production
- ✅ 100GB bandwidth
- ✅ WebSocket support

---

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Environment mode | `production` |
| `PORT` | **Auto** | Server port (Render sets automatically - **DO NOT set manually**) | `10000` |
| `REDIS_URL` | Yes | Redis connection string | `rediss://default:TOKEN@HOST:6379` |
| `HOST` | No | Host to bind to (defaults to `0.0.0.0` for Render) | `0.0.0.0` |
| `AWS_ACCESS_KEY_ID` | No | AWS S3 access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | No | AWS S3 secret key | `...` |
| `AWS_REGION` | No | AWS region | `us-east-1` |
| `AWS_S3_BUCKET` | No | S3 bucket name | `my-bucket` |

---

## Performance Tips

1. **Use Starter Plan** ($7) for production (no cold starts)
2. **Choose region** closest to your users
3. **Enable auto-deploy** only on main branch
4. **Monitor logs** regularly for errors
5. **Set up alerts** in Render dashboard

---

## Next Steps

- ✅ Deploy to Render
- ✅ Set up custom domain (optional)
- ✅ Configure monitoring (optional)
- ✅ Set up CI/CD (optional - Render does this automatically)

---

## Support

- **Render Docs**: https://render.com/docs
- **Upstash Redis**: https://docs.upstash.com/redis
- **Project Issues**: GitHub Issues

---

## Quick Commands

```bash
# Test build locally
npm run build

# Test production server locally
NODE_ENV=production npm start

# Check environment variables
echo $REDIS_URL
```

---

Happy Deploying! 🚀

