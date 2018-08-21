import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import DashboardBuilder from '../components/DashboardBuilder';

import { toggleBuilderPane } from '../actions/dashboardState';
import {
  deleteTopLevelTabs,
  handleComponentDrop,
} from '../actions/dashboardLayout';

function mapStateToProps({ dashboardLayout: undoableLayout, dashboardState, dashboardInfo }) {
  return {
    dashboardLayout: undoableLayout.present,
    editMode: dashboardState.editMode,
    showBuilderPane: dashboardState.showBuilderPane,
    dashboardInfo: dashboardInfo
  };
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators(
    {
      deleteTopLevelTabs,
      handleComponentDrop,
      toggleBuilderPane,
    },
    dispatch,
  );
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashboardBuilder);
