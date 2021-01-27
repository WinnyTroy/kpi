# coding: utf-8
import time

from django.conf import settings
from rest_framework.reverse import reverse

from kpi.fields import KpiUidField
from kpi.utils.hash import get_hash


class PairedData:

    def __init__(
        self,
        parent_uid: str,
        filename: str,
        fields: list,
        asset: 'kpi.models.Asset',
        paired_data_uid: str = None,
    ):
        self.parent_uid = parent_uid
        self.asset = asset
        self.filename = filename
        self.fields = fields
        self.deleted_at = None
        if not paired_data_uid:
            self.paired_data_uid = KpiUidField.generate_unique_id('pd')
        else:
            self.paired_data_uid = paired_data_uid
        self.__hash = get_hash(f'{self.kc_metadata_uniqid}.{str(time.time())}')

    def __str__(self):
        return f'<PairedData {self.paired_data_uid} ({self.filename})>'

    def delete(self, **kwargs):
        del self.asset.paired_data[self.parent_uid]
        self.asset.save(
            update_fields=['paired_data'],
            adjust_content=False,
            create_version=False,
        )

    @property
    def kc_metadata_data_value(self):
        return self.kc_metadata_uniqid

    @property
    def kc_metadata_uniqid(self):
        from kpi.urls.router_api_v2 import URL_NAMESPACE  # avoid circular imports # noqa
        paired_data_url = reverse(
            f'{URL_NAMESPACE}:paired-data-external',
            kwargs={
                'parent_lookup_asset': self.asset.uid,
                'paired_data_uid': self.paired_data_uid,
                'format': 'xml'
            },
        )
        return f'{settings.KOBOFORM_URL}{paired_data_url}'

    @property
    def hash(self):
        return f'md5:{self.__hash}'

    @property
    def is_remote_url(self):
        return True

    @property
    def mimetype(self):
        return 'application/xml'

    @classmethod
    def objects(cls, asset: 'kpi.models.Asset') -> 'kpi.models.PairedData':
        objects_ = {}
        for parent_uid, values in asset.paired_data.items():
            objects_[values['paired_data_uid']] = cls(
                parent_uid, asset=asset, **values
            )
        return objects_

    def save(self, **kwargs):
        try:
            self.asset.paired_data[self.parent_uid]['paired_data_uid']
        except KeyError:
            self.paired_data_uid = KpiUidField.generate_unique_id('pd')

        self.asset.paired_data[self.parent_uid] = {
            'fields': self.fields,
            'filename': self.filename,
            'paired_data_uid': self.paired_data_uid,
        }

        return self.asset.save(
            update_fields=['paired_data'],
            adjust_content=False,
            create_version=False,
        )

    def update(self, updated_values):
        for key, value in updated_values.items():
            if not hasattr(self, key):
                continue
            setattr(self, key, value)