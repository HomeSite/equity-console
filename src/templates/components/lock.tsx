import * as React from 'react'
import { connect } from 'react-redux'
import DocumentTitle from 'react-document-title'

import Section from '../../app/components/section'
import Editor from './editor'
import LockButton from './lockButton'

import { ContractParameters, ContractValue } from '../../contracts/components/parameters'

import { getLockMessage, getSource, getContractParameters, getCompiled } from '../selectors'

const mapStateToProps = (state) => {
  const source = getSource(state)
  const compiled = getCompiled(state)
  const instantiable = compiled && compiled.error === ''
  const contractParameters = getContractParameters(state)
  const hasParams = contractParameters && contractParameters.length > 0
  const result = getLockMessage(state)
  return { source, instantiable, hasParams, result }
}

const ErrorAlert = (props: { result: object }) => {
  let jsx = <small />
  if (props.result) {
    if(props.result._error){
      jsx = (
        <div style={{margin: '25px 0'}} className="alert alert-danger" role="alert">
          <span className="sr-only">Error:</span>
          <span className="glyphicon glyphicon-exclamation-sign" style={{marginRight: "5px"}}></span>
          {props.result._error}
        </div>
      )
    }else if(props.result._success){
      jsx = (
        <div style={{margin: '25px 0'}} className="alert alert-success" role="success">
          <span className="sr-only">Success:</span>
          <span className="glyphicon glyphicon-ok" style={{marginRight: "5px"}}></span>
          {props.result._success}
        </div>
      )
    }
  }
  return jsx
}

const Lock = ({ source, instantiable, hasParams, result }) => {
  let instantiate
  let contractParams
  if (instantiable) {
    contractParams = <div />
    if (hasParams) {
      contractParams = (
        <Section name="Contract Arguments">
          <div className="form-wrapper">
            <ContractParameters />
          </div>
          <div className="form-wrapper">
          </div>
        </Section>
      )
    }

    instantiate = (
      <div>
        <Section name="Value to Lock">
          <div className="form-wrapper">
            <ContractValue />
          </div>
        </Section>
        {contractParams}
        <ErrorAlert result={result} />
        <LockButton />
      </div>
    )
  } else {
    instantiate = ( <div /> )
  }

  return (
    <DocumentTitle title="Lock Value">
      <div>
        <Editor />
        {instantiate}
      </div>
    </DocumentTitle>
  )
}

export default connect(
  mapStateToProps,
)(Lock)
