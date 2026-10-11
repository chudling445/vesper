FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3174

WORKDIR /app

COPY --chown=node:node server.mjs character_config.yaml app.js avatar.js guide.js chess.js index.html getting-started.html Vesper-Setup.exe styles.css favicon.svg manifest.webmanifest sw.js ./
COPY --chown=node:node vendor/ ./vendor/
COPY --chown=node:node models/ ./models/

USER node
EXPOSE 3174

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
