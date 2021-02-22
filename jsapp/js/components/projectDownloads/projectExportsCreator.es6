import React from 'react';
import autoBind from 'react-autobind';
import Select from 'react-select';
import moment from 'moment';
import alertify from 'alertifyjs';
import MultiCheckbox from 'js/components/common/multiCheckbox';
import Checkbox from 'js/components/common/checkbox';
import TextBox from 'js/components/common/textBox';
import ToggleSwitch from 'js/components/common/toggleSwitch';
import {bem} from 'js/bem';
import {actions} from 'js/actions';
import mixins from 'js/mixins';
import {
  QUESTION_TYPES,
  META_QUESTION_TYPES,
  ADDITIONAL_SUBMISSION_PROPS,
  PERMISSIONS_CODENAMES,
} from 'js/constants';
import {
  EXPORT_TYPES,
  EXPORT_FORMATS,
  EXPORT_MULTIPLE_OPTIONS,
} from './exportsConstants';
import assetUtils from 'js/assetUtils';
import exportsStore from 'js/components/projectDownloads/exportsStore';

const NAMELESS_EXPORT_NAME = t('Latest unsaved settings');

/**
 * @prop {object} asset
 *
 * NOTE: we use a nameless export setting to keep last used export settings that
 * weren't saved as named custom setting.
 */
export default class ProjectExportsCreator extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isComponentReady: false,
      isPending: false, // is either saving setting or creating export
      // selectedExportType is being handled by exportsStore to allow other
      // components to know it changed
      selectedExportType: exportsStore.getExportType(),
      selectedExportFormat: null,
      groupSeparator: '/',
      selectedExportMultiple: EXPORT_MULTIPLE_OPTIONS.both,
      isIncludeGroupsEnabled: false,
      isIncludeAllVersionsEnabled: false,
      isAdvancedViewVisible: false,
      isSaveCustomExportEnabled: false,
      customExportName: '',
      isCustomSelectionEnabled: false,
      isFlattenGeoJsonEnabled: true,
      selectedRows: new Set(),
      selectableRowsCount: 0,
      selectedDefinedExport: null,
      definedExports: [],
      isUpdatingDefinedExportsList: false,
    };

    this.unlisteners = [];

    const allSelectableRows = this.getAllSelectableRows();
    if (allSelectableRows) {
      this.state.selectedRows = new Set(allSelectableRows);
      this.state.selectableRowsCount = this.state.selectedRows.size;
    }

    const exportFormatOtions = this.getExportFormatOptions();
    if (exportFormatOtions) {
      // first option is the default one
      this.state.selectedExportFormat = exportFormatOtions[0];
    }

    autoBind(this);
  }

  componentDidMount() {
    this.unlisteners.push(
      exportsStore.listen(this.onExportsStoreChange),
      actions.exports.getExportSettings.completed.listen(this.onGetExportSettings),
      actions.exports.updateExportSetting.completed.listen(this.fetchExportSettings),
      actions.exports.createExportSetting.completed.listen(this.fetchExportSettings),
      actions.exports.deleteExportSetting.completed.listen(this.onDeleteExportSetting),
    );

    this.fetchExportSettings();
  }

  componentWillUnmount() {
    this.unlisteners.forEach((clb) => {clb();});
  }

  onExportsStoreChange() {
    const newExportType = exportsStore.getExportType();
    if (newExportType.value !== this.state.selectedExportType.value) {
      const newStateObj = {
        selectedExportType: newExportType,
        // when export type changes, make sure the custom export is cleared
        // to avoid users saving unwanted changes (the custom export name is not
        // visible unless Advanced View is toggled)
        isSaveCustomExportEnabled: false,
        customExportName: '',
      };

      this.setState(newStateObj);
    }
  }

  onGetExportSettings(response) {
    // we need to prepare the results to be displayed in Select
    const definedExports = [];
    response.results.forEach((result, index) => {
      definedExports.push({
        value: index,
        label: result.name ? result.name : NAMELESS_EXPORT_NAME,
        data: result,
      });
    });

    this.setState({
      isUpdatingDefinedExportsList: false,
      definedExports: definedExports,
    });

    if (!this.state.isComponentReady && response.count >= 1) {
      // load first export settings on initial list load
      this.applyExportSettingToState(response.results[0]);
    }

    this.setState({isComponentReady: true});
  }

  onDeleteExportSetting() {
    this.clearSelectedDefinedExport();
    this.fetchExportSettings();
  }

  getExportFormatOptions() {
    if (this.props.asset.summary?.languages.length >= 2) {
      const options = [EXPORT_FORMATS._xml];
      this.props.asset.summary.languages.forEach((language, index) => {
        options.push({
          value: language,
          label: language,
          langIndex: index,
        });
      });
      return options;
    } else {
      return Object.values(EXPORT_FORMATS);
    }
  }

  getAllSelectableRows() {
    const allRows = new Set();
    if (this.props.asset?.content?.survey) {
      this.props.asset.content.survey.forEach((row) => {
        allRows.add(assetUtils.getRowName(row));
      });
      Object.keys(ADDITIONAL_SUBMISSION_PROPS).forEach((submissionProp) => {
        allRows.add(submissionProp);
      });
    }
    return allRows;
  }

  /**
   * Used when update/create export settings call goes through to make a next
   * call to create an export from this settings.
   * We did not want to make export from every update/create response to make
   * sure the export was actually wanted.
   */
  handleScheduledExport(response) {
    if (typeof this.clearScheduledExport === 'function') {
      this.clearScheduledExport();
    }

    this.setState({isPending: true});

    const exportParams = response.export_settings;
    exportParams.source = this.props.asset.url;
    actions.exports.createExport(exportParams);
  }

  fetchExportSettings() {
    this.setState({isUpdatingDefinedExportsList: true});
    actions.exports.getExportSettings(this.props.asset.uid);
  }

  deleteExportSetting(exportSettingUid) {
    const dialog = alertify.dialog('confirm');
    const opts = {
      title: t('Delete export settings?'),
      message: t('Are you sure you want to delete this settings? This action is not reversible.'),
      labels: {ok: t('Delete'), cancel: t('Cancel')},
      onok: () => {
        actions.exports.deleteExportSetting(
          this.props.asset.uid,
          exportSettingUid
        );
      },
      oncancel: () => {dialog.destroy();},
    };
    dialog.set(opts).show();
  }

  onSelectedDefinedExportChange(newDefinedExport) {
    this.applyExportSettingToState(newDefinedExport.data);
  }

  /**
   * FYI changing anything in the form should clear the selected defined export
   */
  clearSelectedDefinedExport() {
    this.setState({selectedDefinedExport: null});
  }

  onAnyInputChange(statePropName, newValue) {
    const newStateObj = {};
    newStateObj[statePropName] = newValue;
    this.setState(newStateObj);
    this.clearSelectedDefinedExport();
  }

  onSelectedExportTypeChange(newValue) {
    this.clearSelectedDefinedExport();
    exportsStore.setExportType(newValue);
  }

  onSelectedRowsChange(newRowsArray) {
    const newSelectedRows = new Set();
    newRowsArray.forEach((item) => {
      if (item.checked) {
        newSelectedRows.add(item.name);
      }
    });
    this.setState({selectedRows: newSelectedRows});
  }

  toggleAdvancedView() {
    this.setState({isAdvancedViewVisible: !this.state.isAdvancedViewVisible});
  }

  applyExportSettingToState(data) {
    // this silently sets exportsStore value to current one
    exportsStore.setExportType(EXPORT_TYPES[data.export_settings.type], false);

    const exportFormatOtions = this.getExportFormatOptions();
    let selectedExportFormat = exportFormatOtions.find((option) => {
      return option.value === data.export_settings.lang;
    });

    // If saved export lang option doesn't exist anymore, just select first one
    // e.g. language was deleted, or _default was used and in current form
    // version there are languages defined (so no _default available).
    if (!selectedExportFormat) {
      selectedExportFormat = exportFormatOtions[0];
    }

    const newStateObj = {
      selectedExportType: EXPORT_TYPES[data.export_settings.type],
      selectedExportFormat: selectedExportFormat,
      groupSeparator: data.export_settings.group_sep,
      selectedExportMultiple: EXPORT_MULTIPLE_OPTIONS[data.export_settings.multiple_select],
      // FYI Backend keeps booleans as strings
      isIncludeGroupsEnabled: Boolean(data.export_settings.hierarchy_in_labels),
      isIncludeAllVersionsEnabled: Boolean(data.export_settings.fields_from_all_versions),
      // check whether a custom name was given
      isSaveCustomExportEnabled: typeof data.name === 'string' && data.name.length >= 1,
      customExportName: data.name,
      // Select custom export toggle if not all rows are selected
      isCustomSelectionEnabled: this.state.selectableRowsCount !== data.export_settings.fields.length,
      isFlattenGeoJsonEnabled: Boolean(data.export_settings.flatten),
      selectedRows: new Set(data.export_settings.fields),
    };

    // if all rows are selected then fields will be empty, so we need to select all checkboxes manually
    if (newStateObj.selectedRows.size === 0) {
      newStateObj.selectedRows = new Set(this.getAllSelectableRows());
    }

    // select existing item from the dropdown
    this.state.definedExports.forEach((definedExport) => {
      if (definedExport.data.name === data.name) {
        newStateObj.selectedDefinedExport = definedExport;
      }
    });

    this.setState(newStateObj);
  }

  onSubmit(evt) {
    evt.preventDefault();

    const payload = {
      name: '',
      export_settings: {
        fields_from_all_versions: this.state.isIncludeAllVersionsEnabled,
        fields: [],
        group_sep: this.state.groupSeparator,
        hierarchy_in_labels: this.state.isIncludeGroupsEnabled,
        lang: this.state.selectedExportFormat.value,
        multiple_select: this.state.selectedExportMultiple.value,
        type: this.state.selectedExportType.value,
      },
    };

    // flatten is only for GeoJSON
    if (this.state.selectedExportType.value === EXPORT_TYPES.geojson.value) {
      payload.export_settings.flatten = this.state.isFlattenGeoJsonEnabled;
    }

    // if custom export is enabled, but there is no name provided
    // we generate a name for export ourselves
    if (this.state.isSaveCustomExportEnabled) {
      payload.name = this.state.customExportName || this.generateExportName();
    }

    // unless custom selection is enabled, we send empty fields (it means "all fields" for backend)
    if (this.state.isCustomSelectionEnabled) {
      payload.export_settings.fields = Array.from(this.state.selectedRows);
    }

    const foundDefinedExport = this.state.definedExports.find((definedExport) => {
      return definedExport.data.name === payload.name;
    });

    this.setState({isPending: true});

    if (typeof this.clearScheduledExport === 'function') {
      this.clearScheduledExport();
    }

    // Case 1: Don't need to save the export if currently selected a saved one,
    // so we get directly to export creation.
    // Case 2: Also omit saving if user doesn't have permissions to save.
    if (
      this.state.selectedDefinedExport !== null ||
      !mixins.permissions.userCan(PERMISSIONS_CODENAMES.manage_asset, this.props.asset)
    ) {
      this.handleScheduledExport(payload);
    // Case 3: There is a defined export with the same name already, so we need
    // to update it.
    } else if (foundDefinedExport) {
      this.clearScheduledExport = actions.exports.updateExportSetting.completed.listen(
        this.handleScheduledExport
      );
      actions.exports.updateExportSetting(
        this.props.asset.uid,
        foundDefinedExport.data.uid,
        payload,
      );
    // Case 4: There is no defined export like this one, we need to create it.
    } else {
      this.clearScheduledExport = actions.exports.createExportSetting.completed.listen(
        this.handleScheduledExport
      );
      actions.exports.createExportSetting(
        this.props.asset.uid,
        payload,
      );
    }
  }

  generateExportName() {
    const timeString = moment().format('YYYY/MM/DD HH:mm:ss');
    return `Export ${timeString}`;
  }

  getQuestionsList() {
    // survey rows with data
    const output = this.props.asset.content.survey.filter((row) => {
      return (
        Object.keys(QUESTION_TYPES).includes(row.type) ||
        Object.keys(META_QUESTION_TYPES).includes(row.type)
      );
    });

    // additional submission properties added by backend
    Object.keys(ADDITIONAL_SUBMISSION_PROPS).forEach((submissionProp) => {
      output.push({
        name: submissionProp,
        type: submissionProp,
      });
    });

    return output;
  }

  renderRowsSelector() {
    const rows = this.getQuestionsList().map((row) => {
      const rowName = assetUtils.getRowName(row);

      let checkboxLabel = assetUtils.getQuestionDisplayName(
        row,
        this.state.selectedExportFormat?.langIndex
      );
      if (this.state.selectedExportFormat.value === EXPORT_FORMATS._xml.value) {
        checkboxLabel = rowName;
      }

      return {
        checked: this.state.selectedRows.has(rowName),
        disabled: !this.state.isCustomSelectionEnabled,
        label: checkboxLabel,
        name: rowName,
      };
    });

    return (
      <MultiCheckbox
        items={rows}
        onChange={this.onSelectedRowsChange}
      />
    );
  }

  renderAdvancedView() {
    const includeAllVersionsLabel = (
      <span>
        {t('Include data from all')}
        &nbsp;
        <strong>{this.props.asset.deployed_versions.count}</strong>
        &nbsp;
        {t('versions')}
      </span>
    );

    const customSelectionLabel = (
      <span className='project-downloads__title'>
        {t('Custom selection export')}
      </span>
    );

    return (
      <div className='project-downloads__advanced-view'>
        <div className='project-downloads__column project-downloads__column--left'>
          <label className='project-downloads__column-row'>
            <span className='project-downloads__title'>
              {t('Export select_multiple responses')}
            </span>

            <Select
              value={this.state.selectedExportMultiple}
              options={Object.values(EXPORT_MULTIPLE_OPTIONS)}
              onChange={this.onAnyInputChange.bind(
                this,
                'selectedExportMultiple'
              )}
              className='kobo-select'
              classNamePrefix='kobo-select'
              menuPlacement='auto'
              placeholder={t('Select…')}
            />
          </label>

          <div className='project-downloads__column-row'>
            <Checkbox
              checked={this.state.isIncludeAllVersionsEnabled}
              onChange={this.onAnyInputChange.bind(this, 'isIncludeAllVersionsEnabled')}
              label={includeAllVersionsLabel}
            />
          </div>

          <div className='project-downloads__column-row'>
            <Checkbox
              checked={this.state.isIncludeGroupsEnabled}
              onChange={this.onAnyInputChange.bind(this, 'isIncludeGroupsEnabled')}
              label={t('Include groups in headers')}
            />
          </div>

          {this.state.selectedExportType.value === EXPORT_TYPES.geojson.value &&
            <div className='project-downloads__column-row'>
              <Checkbox
                checked={this.state.isFlattenGeoJsonEnabled}
                onChange={this.onAnyInputChange.bind(this, 'isFlattenGeoJsonEnabled')}
                label={t('Flatten GeoJSON')}
              />
            </div>
          }

          <div className='project-downloads__column-row project-downloads__column-row--custom-export'>
            <Checkbox
              checked={this.state.isSaveCustomExportEnabled}
              onChange={this.onAnyInputChange.bind(
                this,
                'isSaveCustomExportEnabled'
              )}
              label={t('Save selection as custom export')}
            />

            <TextBox
              disabled={!this.state.isSaveCustomExportEnabled}
              value={this.state.customExportName}
              onChange={this.onAnyInputChange.bind(this, 'customExportName')}
              placeholder={t('Name your custom export')}
              customModifiers={['on-white']}
            />
          </div>
        </div>

        <div className='project-downloads__column project-downloads__column--right'>
          <ToggleSwitch
            checked={this.state.isCustomSelectionEnabled}
            onChange={this.onAnyInputChange.bind(
              this,
              'isCustomSelectionEnabled'
            )}
            label={customSelectionLabel}
          />

          {this.renderRowsSelector()}
        </div>

        <hr />
      </div>
    );
  }

  getGroupSeparatorLabel() {
    return (
      <span className='project-downloads__title'>
        {t('Group separator')}
      </span>
    );
  }

  renderExportTypeSelector() {
    return (
      <label>
        <span className='project-downloads__title'>
          {t('Select export type')}
        </span>

        <Select
          value={this.state.selectedExportType}
          options={Object.values(EXPORT_TYPES)}
          onChange={this.onSelectedExportTypeChange}
          className='kobo-select'
          classNamePrefix='kobo-select'
          menuPlacement='auto'
        />
      </label>
    );
  }

  renderLegacy() {
    return (
      <React.Fragment>
        <div className='project-downloads__selector-row'>
          {this.renderExportTypeSelector()}
        </div>

        <bem.FormView__cell m='warning'>
          <i className='k-icon-alert' />
          <p>{t('This export format will not be supported in the future. Please consider using one of the other export types available.')}</p>
        </bem.FormView__cell>

        <div className='project-downloads__legacy-iframe-wrapper'>
          <iframe src={
            this.props.asset.deployment__data_download_links[this.state.selectedExportType.value]
          } />
        </div>
      </React.Fragment>
    );
  }

  renderNonLegacy() {
    const exportFormatOtions = this.getExportFormatOptions();

    return (
      <React.Fragment>
        <div className='project-downloads__selector-row'>
          {this.renderExportTypeSelector()}

          <label>
            <span className='project-downloads__title'>
              {t('Value and header format')}
            </span>

            <Select
              value={this.state.selectedExportFormat}
              options={exportFormatOtions}
              onChange={this.onAnyInputChange.bind(
                this,
                'selectedExportFormat'
              )}
              className='kobo-select'
              classNamePrefix='kobo-select'
              menuPlacement='auto'
            />
          </label>

          <TextBox
            value={this.state.groupSeparator}
            onChange={this.onAnyInputChange.bind(this, 'groupSeparator')}
            label={this.getGroupSeparatorLabel()}
            customModifiers={['on-white', 'group-separator']}
          />
        </div>

        <div
          className='project-downloads__advanced-toggle'
          onClick={this.toggleAdvancedView}
        >
          {t('Advanced options')}
          {this.state.isAdvancedViewVisible && (
            <i className='k-icon k-icon-up' />
          )}
          {!this.state.isAdvancedViewVisible && (
            <i className='k-icon k-icon-down' />
          )}
        </div>

        <hr />

        {this.state.isAdvancedViewVisible && this.renderAdvancedView()}

        <div className='project-downloads__submit-row'>
          <div className='project-downloads__defined-exports-selector'>
            {this.state.definedExports.length >= 1 &&
              <React.Fragment>
                <label>
                  <span className='project-downloads__title'>
                    {t('Custom exports')}
                  </span>

                  <Select
                    isLoading={this.state.isUpdatingDefinedExportsList}
                    value={this.state.selectedDefinedExport}
                    options={this.state.definedExports}
                    onChange={this.onSelectedDefinedExportChange}
                    className='kobo-select'
                    classNamePrefix='kobo-select'
                    menuPlacement='auto'
                    placeholder={t('Select…')}
                  />
                </label>

                {this.state.selectedDefinedExport &&
                  mixins.permissions.userCan(PERMISSIONS_CODENAMES.manage_asset, this.props.asset) &&
                  <bem.KoboLightButton
                    m={['red', 'icon-only']}
                    onClick={this.deleteExportSetting.bind(
                      this,
                      this.state.selectedDefinedExport.data.uid
                    )}
                  >
                    <i className='k-icon k-icon-trash'/>
                  </bem.KoboLightButton>
                }
              </React.Fragment>
            }
          </div>

          <bem.KoboButton
            m='blue'
            type='submit'
            onClick={this.onSubmit}
          >
            {t('Export')}
          </bem.KoboButton>
        </div>
      </React.Fragment>
    );
  }

  render() {
    let formClassNames = ['exports-creator'];
    if (!this.state.isComponentReady) {
      formClassNames.push('exports-creator--loading');
    }

    return (
      <bem.FormView__row>
        <bem.FormView__cell m={['page-title']}>
          {t('Downloads')}
        </bem.FormView__cell>

        <bem.FormView__cell m={['box', 'padding']}>
          <bem.FormView__form className={formClassNames.join(' ')}>
            {this.state.selectedExportType.isLegacy &&
              this.renderLegacy()
            }

            {!this.state.selectedExportType.isLegacy &&
              this.renderNonLegacy()
            }
          </bem.FormView__form>
        </bem.FormView__cell>
      </bem.FormView__row>
    );
  }
}