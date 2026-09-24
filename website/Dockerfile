# website/Dockerfile — LOCAL STATIC PREVIEW ONLY.
#
# Production serving happens on the stenella platform (the site is a client
# of it), not through nginx. This image just serves the static files so the
# design can be previewed without the platform — content sections
# (products/posts) will be empty because /s/data and /s/static/lib are
# platform endpoints.
#
#   docker build -f website/Dockerfile -t azzurro-preview .
#   docker run --rm -p 8000:80 azzurro-preview

FROM nginx:alpine

COPY ./azzurro.tech /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]