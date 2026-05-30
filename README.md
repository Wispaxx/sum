# Roblox Update Watcher

Ce projet verifie les versions publiques Roblox toutes les 5 minutes avec GitHub Actions.

Il envoie un message Discord quand :

- tu le lances manuellement pour annoncer la version actuelle ;
- Roblox publie une nouvelle version ;
- le GUID Roblox ou le hash SHA-256 du manifest change.

## Installation gratuite 24/7

1. Cree un nouveau depot GitHub.
2. Envoie ces fichiers dans le depot :
   - `package.json`
   - `watcher.mjs`
   - `.github/workflows/roblox-update-watcher.yml`
3. Dans GitHub, ouvre ton depot puis va dans `Settings`.
4. Va dans `Secrets and variables`, puis `Actions`.
5. Clique `New repository secret`.
6. Nom du secret : `DISCORD_WEBHOOK_URL`.
7. Valeur : colle ton URL de webhook Discord.
8. Va dans l'onglet `Actions`.
9. Ouvre `Roblox Update Watcher`.
10. Clique `Run workflow`.

Le premier lancement manuel envoie la version actuelle avec le hash.
Ensuite, le workflow se lance toutes les 5 minutes et n'envoie un message que si Roblox change de version.

## Important

Si ton URL de webhook a ete postee publiquement, regenere-la dans Discord :

`Modifier le salon > Integrations > Webhooks > ton webhook > Regenerer l'URL`

Puis mets la nouvelle URL dans le secret GitHub `DISCORD_WEBHOOK_URL`.

## Ajouter un channel futur/canary

Dans `watcher.mjs`, de-commente cet exemple :

```js
{ id: "windows-player-zcanary", label: "Roblox Player Windows zcanary", binary: "WindowsPlayer", channel: "zcanary" }
```

Attention : les channels Roblox de test ne sont pas toujours publics. Si Roblox renvoie 403 ou 404, c'est normal.
