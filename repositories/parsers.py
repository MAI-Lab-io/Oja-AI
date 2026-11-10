from io import BytesIO
from django.conf import settings
from rest_framework.exceptions import APIException, ParseError
from rest_framework.parsers import BaseParser, JSONParser


class PayloadTooLarge(APIException):
    status_code = 413
    default_detail = 'Metadata payload exceeds the configured size limit.'


class BoundedJSONParser(BaseParser):
    # DRF buffers JSONParser subclasses before invoking parse(). Use BaseParser
    # so this bound is applied while reading the request stream instead.
    media_type = 'application/json'
    def parse(self, stream, media_type=None, parser_context=None):
        data = stream.read(settings.DATA_UPLOAD_MAX_MEMORY_SIZE + 1)
        if len(data) > settings.DATA_UPLOAD_MAX_MEMORY_SIZE:
            raise PayloadTooLarge()
        try:
            return JSONParser().parse(BytesIO(data), media_type=media_type, parser_context=parser_context)
        except RecursionError:
            raise ParseError('JSON nesting exceeds the supported limit.')
