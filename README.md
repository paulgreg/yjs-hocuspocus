# HocusPocus + REST APIs & BACKUP

That is a YJS HocusPocus server with rest API and backup.

It adds periodic backup/export to JSON files and a few custom REST API endpoinds : 
 - /api/list to list document names, accepts a prefix to filter doc
 - /api/del to remove document
  
API needs secret parameter.

Exemple : 

    curl http://localhost:6011/api/list\?secret\=random-string\&prefix\=\gl


## configuration

`mkdir data backup`

then

`cp .env.dist .env` and update values

 - PORT : listening port, ex : 6011
 - SECRET : long token for authentification (websocket and REST APIs)
 - BACKUP_DIR : backup dir
 - BACKUP_INTERVAL : backup interval in seconds, 86400 for every day

You can also use `ecosystem.config.cjs.sample` file for pm2 usage