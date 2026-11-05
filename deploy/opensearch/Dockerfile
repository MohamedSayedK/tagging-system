# OpenSearch for Railway. A Railway volume is mounted owned by root, but OpenSearch refuses to run as root,
# so the entrypoint hands the data directory to the opensearch user and then drops privileges with gosu
# (the base image has no su, runuser or setpriv).
FROM tianon/gosu:1.17 AS gosu

FROM opensearchproject/opensearch:2.17.1
USER root
COPY --from=gosu /gosu /usr/local/bin/gosu
COPY deploy/opensearch/fix-volume-and-run.sh /fix-volume-and-run.sh
RUN chmod +x /fix-volume-and-run.sh
ENTRYPOINT ["/fix-volume-and-run.sh"]
CMD ["opensearch"]
