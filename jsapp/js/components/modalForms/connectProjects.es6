import React from 'react';
import autoBind from 'react-autobind';
import alertify from 'alertifyjs';
import assetUtils from 'js/assetUtils';
import Select from 'react-select';
import ToggleSwitch from 'js/components/toggleSwitch';
import MultiCheckbox from 'js/components/multiCheckbox';
import TextBox from 'js/components/textBox';
import {actions} from '../../actions';
import {stores} from '../../stores';
import {bem} from 'js/bem';
import {
  MODAL_TYPES,
} from '../../constants';

/*
 * Modal for connecting project data
 *
 * @prop {object} asset
 */
class ConnectProjects extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isVirgin: true,
      isLoading: false,
      // `data_sharing` is an empty object if never enabled before
      isShared: props.asset.data_sharing?.enabled || false,
      attachedParents: [],
      sharingEnabledAssets: null,
      newParent: null,
      newFilename: '',
      newColumnFilters: [],
      parentColumnFilters: [],
      fieldsErrors: {},
    };

    autoBind(this);
  }

  /*
   * Setup
   */

  componentDidMount() {
    this.refreshAttachmentList();

    if (this.state.isShared) {
      this.setState({
        newColumnFilters: this.generateColumnFilters(
          this.props.asset.data_sharing.fields,
          this.props.asset.content.survey,
        ),
      });
    }

    actions.dataShare.getSharingEnabledAssets();

    actions.dataShare.attachToParent.completed.listen(
      this.refreshAttachmentList
    );
    actions.dataShare.attachToParent.failed.listen(
      this.onAttachToParentFailed
    );
    actions.dataShare.detachParent.completed.listen(
      this.refreshAttachmentList
    );
    actions.dataShare.patchParent.completed.listen(
      this.onPatchParentCompleted
    );
    actions.dataShare.getSharingEnabledAssets.completed.listen(
      this.onGetSharingEnabledAssetsCompleted
    );
    actions.dataShare.getAttachedParents.completed.listen(
      this.onGetAttachedParentsCompleted
    );
    actions.dataShare.toggleDataSharing.completed.listen(
      this.onToggleDataSharingCompleted
    );
    actions.dataShare.updateColumnFilters.completed.listen(
      this.onUpdateColumnFiltersCompleted
    );
  }

  /*
   * `actions` Listeners
   */

  onAttachToParentFailed(response) {
    this.setState({
      isLoading: false,
      fieldsErrors: response.responseJSON,
    });
  }

  onGetAttachedParentsCompleted(response) {
    this.setState({
      isVirgin: false,
      isLoading: false,
      attachedParents: response,
    });
  }

  onGetSharingEnabledAssetsCompleted(response) {
    this.setState({sharingEnabledAssets: response});
  }

  onToggleDataSharingCompleted() {
    this.setState({
      isShared: !this.state.isShared,
      newColumnFilters: this.generateColumnFilters(
        this.props.asset.data_sharing.fields,
        this.props.asset.content.survey,
      ),
    });
  }

  // Safely update state after guaranteed columm changes
  onUpdateColumnFiltersCompleted(response) {
    this.setState({
      newColumnFilters: this.generateColumnFilters(
        response.data_sharing.fields,
        this.props.asset.content.survey,
      ),
    });
  }

  onPatchParentCompleted() {
    actions.dataShare.getAttachedParents(this.props.asset.uid);
  }

  refreshAttachmentList() {
    this.setState({
      newParent: null,
      newFilename: '',
    });
    actions.dataShare.getAttachedParents(this.props.asset.uid);
  }

  /*
   * UI Listeners
   */

  onFilenameChange(newVal) {
    this.setState({
      newFilename: newVal,
      fieldsErrors: {},
    });
  }

  onParentChange(newVal) {
    this.setState({
      newParent: newVal,
      fieldsErrors: {},
    });
    this.generateAutoname(newVal);
  }

  onConfirmAttachment(evt) {
    evt.preventDefault();
    if (this.state.newFilename !== '' && this.state.newParent?.url) {
      this.setState({
        fieldsErrors: {},
      });

      this.showColumnFilterModal(
        this.props.asset,
        this.state.newParent,
        this.state.newFilename,
        [],
      );
    } else {
      if (!this.state.newParent?.url) {
        this.setState({
          fieldsErrors: Object.assign(
            this.state.fieldsErrors, {parent: 'No project selected'}
          )
        });
      }
      if (this.state.newFilename === '') {
        this.setState({
          fieldsErrors: Object.assign(
            this.state.fieldsErrors, {filename: 'Field is empty'}
          )
        });
      }
    }
  }

  onRemoveAttachment(newVal) {
    this.setState({isLoading: true})
    actions.dataShare.detachParent(newVal);
  }

  onToggleSharingData() {
    var data = JSON.stringify({
      data_sharing: {
        enabled: !this.state.isShared,
        // Populate fields array if enabling
        fields: !this.state.isShared
        ? this.generateAvailableColumns(this.props.asset.content.survey)
        : [],
      }
    });

    if (!this.state.isShared) {
      let dialog = alertify.dialog('confirm');
      let opts = {
        title: `${t('Privacy Notice')}`,
        message: t('This will attach the full dataset from \"##ASSET_NAME##\" as a background XML file to this form. While not easily visible, it is technically possible for anyone entering data to your form to retrieve and view this dataset. Do not use this feature if \"##ASSET_NAME##\" includes sensitive data.').replaceAll('##ASSET_NAME##', this.props.asset.name),
        labels: {ok: t('Acknowledge and continue'), cancel: t('Cancel')},
        onok: (evt, value) => {
          actions.dataShare.toggleDataSharing(this.props.asset.uid, data);
          dialog.destroy();
        },
        oncancel: () => {
          dialog.destroy();
        }
      };
      dialog.set(opts).show();
    } else {
      actions.dataShare.toggleDataSharing(this.props.asset.uid, data);
    }
  }

  onColumnSelected(columnList) {
    let fields = [];
    columnList.forEach((item) => {
      if (item.checked) {
        fields.push(item.label);
      }
    })
    var data = JSON.stringify({
      data_sharing: {
        enabled: this.state.isShared,
        fields: fields,
      }
    });

    actions.dataShare.updateColumnFilters(this.props.asset.uid, data);
  }

  /*
   * Utilities
   */

  generateAutoname(newParent) {
    if (newParent) {
      let autoname = newParent.name;
      autoname = autoname.toLowerCase().substring(0, 30).replace(/(\ |\.)/g, '_');
      this.setState({newFilename: autoname});
    }
  }

  generateColumnFilters(selectedColumns, selectableQuestions) {
    let selectableColumns = [];
    // We need to flatten questions if coming from survey
    if (selectableQuestions?.length && typeof selectableQuestions[0] === 'object') {
      let questions = assetUtils.getSurveyFlatPaths(selectableQuestions);
      for (const key in questions) {
        if (!questions[key].includes('version')) {
          selectableColumns.push(questions[key]);
        }
      }
    } else {
      selectableColumns = selectableQuestions;
    }

    // Figure out what columns need to be 'checked' or 'unchecked' by comparing
    // `selectedColumns` - the columns are already selected versus
    // `selectableColumns` - the columns that are allowed to be exposed
    let columnsToDisplay = [];
    // 'Check' every column if no fields exist, or every column is already checked
    if (
      selectedColumns.length == 0 ||
      selectedColumns.length == selectableColumns.length
    ) {
      selectableColumns.forEach((column) => {
        columnsToDisplay.push({label: column, checked: true});
      });
    } else {
      selectableColumns.forEach((column) => {
        // 'Check' only matching columns
        columnsToDisplay.push({
          label: column,
          checked: selectedColumns.includes(column),
        });
      });
    }
    return columnsToDisplay;
  }

  generateTruncatedDisplayName(name) {
    return name.length > 30 ? `${name.substring(0, 30)}...` : name;
  }

  generateFilteredAssetList() {
    let attachedParentUids = [];
    this.state.attachedParents.forEach((item) => {
      attachedParentUids.push(item.parentUid)
    });

    // Filter out attached projects from displayed asset list
    return (
      this.state.sharingEnabledAssets.results.filter(
        item => !attachedParentUids.includes(item.uid)
      )
    );
  }

  showColumnFilterModal(asset, parent, filename, fields, attachmentUrl) {
    stores.pageState.showModal(
      {
        type: MODAL_TYPES.DATA_ATTACHMENT_COLUMNS,
        generateColumnFilters: this.generateColumnFilters,
        asset: asset,
        parent: parent,
        filename: filename,
        fields: fields,
        attachmentUrl: attachmentUrl,
      }
    );
  }

  /*
   * Rendering
   */

  renderLoading(message = t('loading…')) {
    return (
      <bem.Loading>
        <bem.Loading__inner>
          <i />
          {message}
        </bem.Loading__inner>
      </bem.Loading>
    );
  }

  renderSelect(sharingEnabledAssets) {
    const selectClassNames = ['kobo-select__wrapper'];
    if (this.state.fieldsErrors.parent) {
      selectClassNames.push('kobo-select__wrapper--error');
    }
    return(
      <div className={selectClassNames.join(' ')}>
        <Select
          placeholder={t('Select a different project to import data from')}
          options={sharingEnabledAssets}
          value={this.state.newParent}
          isLoading={(this.state.isVirgin || this.state.isLoading || !sharingEnabledAssets)}
          getOptionLabel={option => option.name}
          getOptionValue={option => option.url}
          noOptionsMessage={() => {return t('No projects to connect')}}
          onChange={this.onParentChange}
          className='kobo-select'
          classNamePrefix='kobo-select'
        />
        <label className='select-errors'>
          {this.state.fieldsErrors.parent}
        </label>
      </div>
    );
  }

  renderSwitch() {
    if (this.state.isShared) {
      return (
        <div className='connect-projects__export'>
          <div className='connect-projects__export--switch'>
            <ToggleSwitch
              onChange={this.onToggleSharingData.bind(this)}
              label={t('Data sharing enabled')}
              checked={this.state.isShared}
            />
            <br />
            {t('Deselect any questions you do not want to share in the right side table')}
          </div>
          <div className='connect-projects__export--multicheckbox'>
            <MultiCheckbox
              items={this.state.newColumnFilters}
              onChange={this.onColumnSelected}
            />
          </div>
        </div>
      );
    } else {
      return (
        <div className='connect-projects__export'>
          <div className='connect-projects__export--switch'>
            <ToggleSwitch
              onChange={this.onToggleSharingData.bind(this)}
              label={t('Data sharing disabled')}
              checked={this.state.isShared}
            />
          </div>
        </div>
      );
    }
  }

  renderImports(sharingEnabledAssets) {
    if (sharingEnabledAssets) {
      return (
        <div className='connect-projects__import'>
          <div className='connect-projects__import--form'>
            {this.renderSelect(sharingEnabledAssets)}

            <TextBox
              placeholder={t('Give a unique name to the import')}
              value={this.state.newFilename}
              onChange={this.onFilenameChange}
              errors={this.state.fieldsErrors.filename}
            />

            <bem.KoboButton
              m='blue'
              onClick={this.onConfirmAttachment}
            >
              {t('Import')}
            </bem.KoboButton>
          </div>

          {/* Display attached projects */}
          <ul className='connect-projects__import--list'>
            <label>{t('Imported')}</label>
            {(this.state.isVirgin || this.state.isLoading) &&
              <div className='connect-projects__import--list-item'>
                {this.renderLoading(t('Loading imported projects'))}
              </div>
            }
            {!this.state.isLoading && this.state.attachedParents.length == 0 &&
              <li className='no-imports'>
                {t('No data imported')}
              </li>
            }
            {!this.state.isLoading && this.state.attachedParents.length > 0 &&
              this.state.attachedParents.map((item, n) => {
                return (
                  <li key={n} className='connect-projects__import--list-item'>
                    <i className="k-icon k-icon-check"/>
                    <div className='imported-names'>
                      <span className='imported-filename'>
                        {item.filename}
                      </span>
                      <span className='imported-parent'>
                        {this.generateTruncatedDisplayName(item.parentName)}
                      </span>
                    </div>
                    <div className='imported-options'>
                      <i
                        className="k-icon-trash"
                        onClick={() => this.onRemoveAttachment(item.attachmentUrl)}
                      />
                      <i
                        className="k-icon-settings"
                        onClick={() => this.showColumnFilterModal(
                          this.props.asset,
                          {
                            uid: item.parentUid,
                            name: item.parentName,
                            url: item.parentUrl,
                          },
                          item.filename,
                          item.childFields,
                          item.attachmentUrl,
                        )}
                      />
                    </div>
                  </li>
                );
              })
            }
          </ul>
        </div>
      );
    }
  }

  render() {
    let sharingEnabledAssets = [];
    if (this.state.sharingEnabledAssets !== null) {
      sharingEnabledAssets = this.generateFilteredAssetList();
    }

    return (
      <bem.FormView__row>

        {/* Enable data sharing */}
        <bem.FormView__cell m={['page-title']}>
          <i className="k-icon k-icon-folder-out"/>
          <h2>{t('Share data with other project forms')}</h2>
        </bem.FormView__cell>

        <bem.FormView__cell m={['box', 'padding']}>
          <bem.FormView__form>
            <span>
              {t('Enable data sharing to allow other forms to import and use dynamic data from this project. Learn more about dynamic data attachments')}
              <a href='#'>{t(' ' + 'here')}</a>
            </span>
            {this.renderSwitch()}
          </bem.FormView__form>
        </bem.FormView__cell>

        {/* Attach other projects data */}
        <bem.FormView__cell m={['page-title']}>
          <i className="k-icon k-icon-folder-in"/>
          <h2>{t('Import other project data')}</h2>
        </bem.FormView__cell>

        <bem.FormView__cell m={['box', 'padding']}>
          <bem.FormView__form>
            <span>
              {t('Connect with other project(s) to import dynamic data from them into this project. Learn more about dynamic data attachments')}
              <a href='#'>{t(' ' + 'here')}</a>
            </span>
            {this.renderImports(sharingEnabledAssets)}
          </bem.FormView__form>
        </bem.FormView__cell>
      </bem.FormView__row>
    );
  }
}

export default ConnectProjects;