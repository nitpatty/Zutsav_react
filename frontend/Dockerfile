# Step 1: Build React app
FROM node:18 as build

WORKDIR /app
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ .

# CRA inlines REACT_APP_* vars at build time — pass them via --build-arg to
# point this image at a different backend/domain without editing source.
# Example: docker build --build-arg REACT_APP_API_URL=https://api.zutsav.com/api ...
ARG REACT_APP_API_URL
ARG REACT_APP_WEB_URL
ARG REACT_APP_ADMIN_URL
ARG REACT_APP_SUPPORT_EMAIL
ARG REACT_APP_PRIVACY_URL
ARG REACT_APP_TERMS_URL
ARG REACT_APP_MICROSOFT_CLARITY_PROJECT_ID
ENV REACT_APP_API_URL=$REACT_APP_API_URL \
    REACT_APP_WEB_URL=$REACT_APP_WEB_URL \
    REACT_APP_ADMIN_URL=$REACT_APP_ADMIN_URL \
    REACT_APP_SUPPORT_EMAIL=$REACT_APP_SUPPORT_EMAIL \
    REACT_APP_PRIVACY_URL=$REACT_APP_PRIVACY_URL \
    REACT_APP_TERMS_URL=$REACT_APP_TERMS_URL \
    REACT_APP_MICROSOFT_CLARITY_PROJECT_ID=$REACT_APP_MICROSOFT_CLARITY_PROJECT_ID

RUN npm run build

# Step 2: Serve using NGINX
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
