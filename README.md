# HocusPocus + REST APIs & BACKUP

That is a YJS HocusPocus server with rest API and backup

It adds periodic backups to JSON files and a few custom HTTP methods : 
 - /list to list docnument names
 - /del to remove document

## configuration

`cp .env.dist .env` and update values

 - PORT : listening port, ex : 6011
 - SECRET : long token for authentification (websocket and REST APIs)
 - BACKUP_DIR : backup dir
 - BACKUP_INTERVAL : backup interval in seconds, 86400 for every day