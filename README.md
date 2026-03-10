# 🚀 Guide d'installation — Dashboard Pi

## Prérequis sur le Raspberry Pi

### 1. Mettre à jour le système

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Installer Node.js 20 LTS (via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # doit afficher v20.x.x
npm --version
```

### 3. Installer PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib

# Démarrer et activer au boot
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Vérifier
sudo systemctl status postgresql
```

### 4. Créer la base de données et l'utilisateur

```bash
sudo -u postgres psql <<EOF
CREATE USER dashboard_user WITH PASSWORD 'MOT_DE_PASSE_FORT_ICI';
CREATE DATABASE dashboard_pi OWNER dashboard_user;
GRANT ALL PRIVILEGES ON DATABASE dashboard_pi TO dashboard_user;
\q
EOF
```

> ⚠️ Remplacez `MOT_DE_PASSE_FORT_ICI` par un vrai mot de passe

---

## Installation du projet

### 5. Cloner / copier le projet

```bash
# Créer le dossier
mkdir -p ~/apps
cd ~/apps

# Si via git :
git clone <votre-repo> dashboard-pi
cd dashboard-pi

# Ou copier les fichiers manuellement et :
cd ~/apps/dashboard-pi
```

### 6. Installer les dépendances

```bash
npm install
```

### 7. Configurer les variables d'environnement

```bash
cp .env.example .env
nano .env
```

Remplir les valeurs dans `.env` :
- `DB_PASSWORD` : le mot de passe PostgreSQL créé à l'étape 4
- `SESSION_SECRET` : générer avec :

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 8. Initialiser la base de données + créer l'admin

```bash
npm run setup
```

Ce script va :
- Créer toutes les tables
- Vous demander un identifiant et mot de passe admin
- Optionnellement ajouter des données de démo

### 9. Lancer en mode test

```bash
npm start
```

Ouvrir dans le navigateur : `http://localhost:3000`

---

## PM2 — Redémarrage automatique

### 10. Installer PM2

```bash
sudo npm install -g pm2
```

### 11. Lancer avec PM2

```bash
cd ~/apps/dashboard-pi
pm2 start src/server.js --name dashboard-pi --env production

# Sauvegarder pour démarrage auto
pm2 save
pm2 startup
# Copier-coller la commande affichée par pm2 startup
```

### Commandes PM2 utiles

```bash
pm2 status                    # état de l'app
pm2 logs dashboard-pi         # logs en temps réel
pm2 restart dashboard-pi      # redémarrer
pm2 stop dashboard-pi         # arrêter
pm2 monit                     # monitoring interactif
```

---

## Accès local réseau

Trouver l'IP du Raspberry Pi :
```bash
hostname -I
```

Accéder depuis n'importe quel appareil sur le même réseau :
```
http://192.168.x.x:3000
```

---

## Accès distant avec Tailscale (RECOMMANDÉ)

Tailscale crée un VPN P2P chiffré. Pas besoin d'ouvrir de ports.

### 12. Installer Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Suivre le lien affiché pour authentifier le Raspberry Pi sur votre compte Tailscale.

### 13. Installer Tailscale sur vos autres appareils

- **iOS/Android** : App Store / Play Store → "Tailscale"
- **Windows/Mac** : https://tailscale.com/download

### 14. Accéder depuis n'importe où

```bash
# Trouver l'IP Tailscale du Pi
tailscale ip -4
# Exemple : 100.64.x.x
```

Accéder depuis n'importe quel appareil connecté à Tailscale :
```
http://100.64.x.x:3000
```

---

## Sécurité supplémentaire (recommandée)

### Pare-feu UFW

```bash
sudo apt install -y ufw

# Règles de base
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 3000/tcp  # ou restreindre aux IPs Tailscale uniquement

sudo ufw enable
sudo ufw status
```

### Fail2ban (protection SSH)

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Désactiver le login root PostgreSQL

```bash
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'MOT_DE_PASSE_FORT';"
```

---

## Structure des fichiers de logs

```
logs/
  security-2024-01-15.log    # Un fichier par jour
  security-2024-01-16.log
```

Consulter les tentatives de connexion :
```bash
grep "AUTH_FAILED" logs/security-*.log
grep "LOGIN_SUCCESS" logs/security-*.log
```

---

## Mise à jour du projet

```bash
cd ~/apps/dashboard-pi
# Mettre à jour les fichiers...
npm install  # si package.json a changé
pm2 restart dashboard-pi
```

---

## Résolution de problèmes courants

### PostgreSQL ne démarre pas
```bash
sudo journalctl -u postgresql --no-pager -n 50
sudo pg_lsclusters
```

### Port 3000 déjà utilisé
```bash
lsof -i :3000
# Tuer le processus ou changer PORT dans .env
```

### Vérifier les logs de l'app
```bash
pm2 logs dashboard-pi --lines 100
```

### Réinitialiser le mot de passe admin
```bash
cd ~/apps/dashboard-pi
npm run setup
# Choisir "Oui" pour réinitialiser
```
