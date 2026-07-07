# Oracle Cloud deployment

This app can run on an Oracle Cloud VM with Docker Compose. SQLite is still used, so the important part is keeping `./data` on persistent VM storage.

## VM checklist

- Use an Ampere ARM or regular AMD VM shape.
- Install Docker and Docker Compose.
- Open TCP port `8081` in the Oracle Cloud security list or network security group.
- Open TCP port `8081` in the VM firewall if it is enabled.
- Keep the repository folder on persistent block storage if you later attach a separate volume.

## Deploy

From the repository folder on the VM:

```bash
mkdir -p data uploads
docker compose up -d --build
```

Then open:

```text
http://YOUR_SERVER_IP:8081
```

The Docker setup exposes Roster Calculator on host port `8081` by default. That leaves port `8080` available for LOHC Flows.

To choose a different host port, create or edit `.env` next to `docker-compose.yml`:

```bash
ROSTER_PORT=8082
```

## Update

```bash
git pull --ff-only origin main
docker compose up -d --build
```

## Backup

Stop the container before copying the SQLite database:

```bash
docker compose stop
cp data/roster-calculator.sqlite roster-calculator-backup.sqlite
docker compose up -d
```

If you want the app behind a domain later, put Caddy, Nginx Proxy Manager, or another reverse proxy in front of it and forward traffic to `roster-calculator:3000`.
