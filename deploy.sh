#!/bin/bash

# Define variables for directory paths and user/group for permissions
deploy_dir="/var/www/hemlock"
http_user="www-data"  # Apache user on Debian, adjust if different
node_user="node"  # Node user on Debian, adjust if different
log_dir="/var/log/pm2-node"

# Install sqlite3
echo "Installing sqlite3..."
apt install -y sqlite3

# Create deployment directory structure
echo "Creating deployment directories..."
mkdir -p "${deploy_dir}/client"
mkdir -p "${deploy_dir}/static/covers"
mkdir -p "${log_dir}"

# Build the client
echo "Building the client application..."
npm run install-all
npm run build

# Copy the built client files to the deployment directory
echo "Copying built client files..."
cp -R "./client/build/." "${deploy_dir}/client/"

# Copy the server files to the deployment directory
echo "Copying server files..."
cp -R "./server/." "${deploy_dir}/server"

# Set ownership and permissions
echo "Setting ownership and permissions..."
chown -R ${http_user}:${http_user} "${deploy_dir}/client"
chown -R ${node_user}:${node_user} "${deploy_dir}/server"
chown -R ${node_user}:${node_user} "${deploy_dir}/static"
find "${deploy_dir}" -type d -exec chmod 755 {} \;
find "${deploy_dir}" -type f -exec chmod 644 {} \;
chmod -R 775 "${deploy_dir}/static"

# Nginx configuration
echo "Configuring Nginx..."
cp "./nginx/hemlock" "/etc/nginx/sites-available/hemlock"
ln -sf "/etc/nginx/sites-available/hemlock" "/etc/nginx/sites-enabled/hemlock"

# Start the application using PM2
echo "Starting the application using PM2..."
COVERS_DIR="../static/covers" pm2 start "${deploy_dir}/server/main.js" --name "Hemlock" --update-env --uid ${node_user} --gid ${node_user} --output "${log_dir}/out.log" --error "${log_dir}/error.log"

# Save the PM2 process list
pm2 save

# Setup PM2 to restart on system boot
pm2 startup -u node --hp /home/node

# Reload Nginx to apply new configuration
echo "Reloading Nginx..."
systemctl reload nginx

echo "Deployment setup completed."
