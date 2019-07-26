import React from 'react';
import PropTypes from 'prop-types';
import autoBind from 'react-autobind';
import reactMixin from 'react-mixin';
import Reflux from 'reflux';
import DocumentTitle from 'react-document-title';
import {Link} from 'react-router';
import bem from 'js/bem';
import mixins from 'js/mixins';
import stores from 'js/stores';
import actions from 'js/actions';
import {t} from 'js/utils';
import {
  ASSET_TYPES,
  MODAL_TYPES
} from 'js/constants';
import AssetInfoBox from './assetInfoBox';
import AssetContentSummary from './AssetContentSummary';
import {renderLoading} from 'js/components/modalForms/modalHelpers';

class LibraryAsset extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      asset: false
    };
    autoBind(this);
  }

  componentWillReceiveProps(nextProps) {
    // trigger loading message when switching assets
    if (nextProps.params.uid !== this.props.params.uid) {
      this.setState({asset: false});
    }
  }

  componentDidMount() {
    this.listenTo(stores.asset, this.onAssetLoad);

    const uid = this.currentAssetID();
    if (uid) {
      actions.resources.loadAsset({id: uid});
    }
  }

  onAssetLoad(data) {
    const uid = this.currentAssetID();
    const asset = data[uid];
    if (asset) {
      this.setState({asset: asset});
    }
  }

  showSharingModal(evt) {
    evt.preventDefault();
    stores.pageState.showModal({
      type: MODAL_TYPES.SHARING,
      assetid: this.state.asset.uid
    });
  }

  showDetailsModal(evt) {
    let modalType;
    if (this.state.asset.asset_type === ASSET_TYPES.template.id) {
      modalType = MODAL_TYPES.LIBRARY_TEMPLATE;
    } else if (this.state.asset.asset_type === ASSET_TYPES.collection.id) {
      modalType = MODAL_TYPES.LIBRARY_COLLECTION;
    }
    evt.preventDefault();
    stores.pageState.showModal({
      type: modalType,
      asset: this.state.asset
    });
  }

  renderActionButtons() {
    let hasDetailsEditable = (
      this.state.asset.asset_type === ASSET_TYPES.template.id ||
      this.state.asset.asset_type === ASSET_TYPES.collection.id
    );
    return (
      <bem.FormView__cell m='action-buttons'>
        {this.state.asset.asset_type !== ASSET_TYPES.collection.id &&
          <Link
            to={`/library/asset/${this.state.asset.uid}/edit`}
            className='form-view__link form-view__link--edit right-tooltip'
            data-tip={t('Edit in Form Builder')}
          >
            <i className='k-icon-edit' />
          </Link>
        }

        {hasDetailsEditable &&
          <bem.FormView__link
            onClick={this.showDetailsModal}
            className='right-tooltip'
            data-tip={t('Modify details')}
          >
            <i className='k-icon-settings' />
          </bem.FormView__link>
        }

        <bem.FormView__link
          m='preview'
          onClick={this.showSharingModal}
          className='right-tooltip'
          data-tip={t('Share')}
        >
          <i className='k-icon-user-share' />
        </bem.FormView__link>
      </bem.FormView__cell>
    );
  }

  render() {
    if (this.state.asset === false) {
      return renderLoading();
    }

    const docTitle = this.state.asset.name || t('Untitled');

    return (
      <DocumentTitle title={`${docTitle} | KoboToolbox`}>
        <bem.FormView m='form'>
          <bem.FormView__row>
            <bem.FormView__cell m={['columns', 'first']}>
              <bem.FormView__cell m='label'>
                {t('Details')}
              </bem.FormView__cell>

              {this.renderActionButtons()}
            </bem.FormView__cell>

            <AssetInfoBox asset={this.state.asset}/>
          </bem.FormView__row>

          <bem.FormView__row>
            <bem.FormView__cell m={['columns', 'first']}>
              <bem.FormView__cell m='label'>
                {t('Quick look')}
              </bem.FormView__cell>
            </bem.FormView__cell>

            <AssetContentSummary
              assetContent={this.state.asset.content}
            />
          </bem.FormView__row>
        </bem.FormView>
      </DocumentTitle>
    );
  }
}

reactMixin(LibraryAsset.prototype, mixins.contextRouter);
reactMixin(LibraryAsset.prototype, Reflux.ListenerMixin);

LibraryAsset.contextTypes = {
  router: PropTypes.object
};

export default LibraryAsset;