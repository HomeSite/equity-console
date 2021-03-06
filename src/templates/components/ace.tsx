// external imports
import * as React from 'react'
import { connect } from 'react-redux'
import AceEditor from 'react-ace'
import 'brace/theme/monokai'

import '../util/ivymode.js'

const mapStateToProps = undefined
const mapDispatchToProps = (dispatch) => {
  return {
    handleChange: (value) => {
      dispatch({type: 'TEST'})
    }
  }
}

const Ace = ({source, handleChange}) => {
  return (
    <div className="panel-body">
      <AceEditor
        mode="ivy"
        theme="monokai"
        onChange={handleChange}
        name="aceEditor"
        minLines={15}
        maxLines={25}
        width="100%"
        tabSize={2}
        value={source}
        readOnly={true}
        editorProps={{$blockScrolling: Infinity}}
        setOptions={{
          useSoftTabs: true,
          showPrintMargin: false,
          fontFamily: "Menlo, Monaco, Consolas, Courier New, monospace",
          fontSize: 16
        }}
      />
    </div>
  )
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Ace)
