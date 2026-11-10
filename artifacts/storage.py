from django.core.files.storage import storages


def storage():
    # This alias can be replaced with a private object-storage backend at deployment.
    return storages['artifacts']
