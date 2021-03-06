// external imports
import { createSelector } from 'reselect'
import { sha3_256 } from 'js-sha3'
import { calGas } from './decimals'

// ivy imports
import { client, parseError } from '../core'
import { AppState } from '../app/types'
import { CompiledTemplate } from '../templates/types'
import { strToHexCharCode } from './util'

import {
  Contract,
  ContractsState,
  ContractMap,
} from './types'

import {
  HashFunction,
  ClauseParameterType,
  Input,
  InputMap,
  ProgramInput,
  ValueInput
} from '../inputs/types'

import {
  isValidInput,
  getData,
  addParameterInput,
} from '../inputs/data'

import {
  ControlWithProgram,
  ControlWithAddress,
  DataWitness,
  KeyId,
  SignatureWitness,
  SpendFromAccount,
  WitnessComponent, SpendUnspentOutput, PublickeyHashWitness
} from '../core/types'
import { SPEND_CONTRACT } from './actions';

export const getState = (state: AppState): ContractsState => state.contracts

export const getContractTemplateName = createSelector(getState, (state) => state.selectedContractName)

export const getContractProgram = createSelector(getState, (state) => state.selectedContractProgram)

export const getUtxoId = createSelector(getState, (state) => state.utxoId)

export const getContract = createSelector(
  getState,
  (state: ContractsState) => state.contract
)

export const getIsCalling = createSelector(
  getState,
  (state: ContractsState) => state.isCalling
)

// export const getContract = (state: AppState, contractId: string) => {
//   const contractMap = getContractMap(state)
//   return contractMap[contractId]
// }

export const getSpendContractId = createSelector(
  getState,
  (state: ContractsState): string => state.utxoId
)

export const getSelectedClauseIndex = createSelector(
  getState,
  (state: ContractsState): number => {
    let selectedClauseIndex = state.selectedClauseIndex
    if (typeof selectedClauseIndex === "number") {
      return selectedClauseIndex
    } else {
      return parseInt(selectedClauseIndex, 10)
    }
  }
)

export const getContractMap = createSelector(
  getState,
  (state: ContractsState) => state.contractMap
)

export const getSpendContract = createSelector(
  getContractMap,
  getSpendContractId,
  (contractMap: ContractMap, contractId: string) => {
    const spendContract = contractMap[contractId]
    if (spendContract === undefined)
      throw "no contract for ID " + contractId
    return spendContract
  }
)

export const getShowUnlockInputErrors = createSelector(
  getState,
  (state: ContractsState): boolean => state.showUnlockInputErrors
)

export const getInputSelector = (id: string) => {
  return createSelector(
    getInputMap,
    (inputMap: InputMap) => {
      const input = inputMap[id]
      if (input === undefined) {
        throw "bad input ID: " + id
      } else {
        return input
      }
    }
  )
}

export const getSpendInputSelector = (id: string) => {
  return createSelector(
    getSpendInputMap,
    (spendInputMap: InputMap) => {
      let spendInput = spendInputMap[id]
      if (spendInput === undefined) {
        throw "bad spend input ID: " + id
      } else {
        return spendInput
      }
    }
  )
}

export const getSpendContractArgs = createSelector(
  getSpendContract,
  (contract: Contract): string[] => contract.contractArgs
)

export const getSpendInputMap = createSelector(
  getSpendContract,
  spendContract => spendContract.spendInputMap
)

export const getInputMap = createSelector(
  getSpendContract,
  spendContract => spendContract.inputMap
)

export const getParameterIds = createSelector(
  getSpendContract,
  spendContract => spendContract.template.params.map(param => "contractParameters." + param.name)
)

export const getSelectedClause = createSelector(
  getSpendContract,
  getSelectedClauseIndex,
  (spendContract, clauseIndex) => {
    return spendContract.template.clause_info[clauseIndex]
  }
)

export const getClauseName = createSelector(
  getSelectedClause,
  clause => clause.name
)

export const getClauseParameters = createSelector(
  getSelectedClause,
  (clause) => clause.params
)

export const getClauseParameterIds = createSelector(
  getClauseName,
  getClauseParameters,
  (clauseName, clauseParameters) => {
    if (!clauseParameters) {
      return []
    }
    return clauseParameters.map(param => "clauseParameters." + clauseName + "." + param.name)
  }
)

export function dataToArgString(data: number | Buffer): string {
  if (typeof data === "number") {
    let buf = Buffer.alloc(8)
    buf.writeIntLE(data, 0, 8)
    return buf.toString("hex")
  } else {
    return data.toString("hex")
  }
}

export const getClauseValueInfo = createSelector(
  getSelectedClause,
  (clause) => {
    return clause.values
  }
)

export const getClauseUnlockInput = createSelector(
  // getSelectedClause,
  getSpendInputMap,
  // (clause, spendInputMap) => {
  (spendInputMap) => {
    let input
    // clause.valueInfo.forEach(value => {
    //   if (value.program === undefined) {
    input = spendInputMap["unlockValue.accountInput"]
    //   }
    // })
    return input
  }
)

export const getUnlockAction = createSelector(
  getSpendContract,
  getClauseUnlockInput,
  (contract, unlockInput) => {
    if (unlockInput === undefined || unlockInput.value === '') {
      return undefined
    }
    return {
      type: "controlWithAddress",
      accountId: unlockInput.value,
      assetId: contract.assetId,
      amount: contract.amount
    } as ControlWithAddress
  }
)

export const getClauseFlag = (templateName, clausename) => {
  const type = templateName + "." + clausename
  switch (type) {
    case "TradeOffer.trade":
    case "Escrow.approve":
    case "LoanCollateral.repay":
    case "CallOption.exercise":
      return "00000000"
    case "TradeOffer.cancel":
      return "13000000"
    case "Escrow.reject":
      return "1a000000"
    case "LoanCollateral.default":
      return "1b000000"
    case "CallOption.expire":
      return "20000000"
    default:
      throw "can not find the flag of clause type:" + type
  }
}

export const getClauseWitnessComponents = createSelector(
  getSpendInputMap,
  getClauseName,
  getClauseParameters,
  getSpendContract,
  getSelectedClause,
  (spendInputMap: InputMap, clauseName: string, clauseParameters, contract, clauseInfo): WitnessComponent[] => {
    const witness: WitnessComponent[] = []
    clauseParameters.forEach(clauseParameter => {
      const clauseParameterPrefix = "clauseParameters." + clauseName + "." + clauseParameter.name
      switch (clauseParameter.type) {
        case "PublicKey": {
          const inputId = clauseParameterPrefix + ".publicKeyInput.provideStringInput"
          const input = spendInputMap[inputId]
          if (input !== undefined && input.type !== "provideStringInput" && input.value) {
            witness.push({ type: "data", raw_data: { value: input.value } })
          } else {
            const inputId = clauseParameterPrefix + ".publicKeyInput.accountInput"
            const input = spendInputMap[inputId]
            if (input == undefined || input.type !== "accountInput" || !input.value) {
              throw "publicKeyInput surprisingly not found for String clause parameter"
            }
            witness.push({type: "publickey_hash", accountId: input.value})
          }
          return
        }
        case "String": {
          let inputId = clauseParameterPrefix + ".stringInput.provideStringInput"
          let input = spendInputMap[inputId]
          if (input !== undefined) {
            witness.push({ type: "data", raw_data: { value: input.value } })
            return
          } else {
            inputId = clauseParameterPrefix + ".provideOriginInput"
            input = spendInputMap[inputId]
            if (input !== undefined) {
              witness.push({ type: "data", raw_data: { value: strToHexCharCode(input.value) } })
              return
            }
          }
          throw "surprisingly not found for String clause parameter"
        }
        case "Signature": {
          const accountInputId = clauseParameterPrefix + ".signatureInput.accountInput"
          const accountinput = spendInputMap[accountInputId]
          if (accountinput === undefined || accountinput.type !== "accountInput") {
            throw "accountInput surprisingly not found"
          }
          // const passwordInputId = clauseParameterPrefix + ".signatureInput.passwordInput"
          // const passwordInput = spendInputMap[passwordInputId]
          // if (passwordInput === undefined || passwordInput.type !== "passwordInput") {
          //   throw "passwordInput surprisingly not found"
          // }
          const signatureWitness = {type: "signature", accountId: accountinput.value} as SignatureWitness
          witness.push(signatureWitness)
          return
        }
        default: {
          const val = dataToArgString(getData(clauseParameterPrefix, spendInputMap))
          witness.push({
            type: "data",
            raw_data: val
          })
          return
        }
      }
    })
    if (contract.template.clause_info.length > 1) {
      witness.push(
        { type: "data", 
          raw_data: { value: getClauseFlag(contract.template.name, clauseInfo.name) }
        })
    }
    return witness
  }
)

// export const getClauseMintimes = createSelector(
//   getSpendContract,
//   getSelectedClauseIndex,
//   (spendContract, clauseIndex) => {
//     const clauseName = spendContract.clauseList[clauseIndex]
//     const mintimes = spendContract.template.clause_info[clauseIndex].mintimes
//     return mintimes.map(argName => {
//       const inputMap = spendContract.inputMap
//       return new Date(inputMap["contractParameters." + argName + ".timeInput.timestampTimeInput"].value)
//     })
//   }
// )

// export const getClauseMaxtimes = createSelector(
//   getSpendContract,
//   getSelectedClauseIndex,
//   (spendContract, clauseIndex) => {
//     const clauseName = spendContract.clauseList[clauseIndex]
//     const maxtimes = spendContract.template.clause_info[clauseIndex].maxtimes
//     if (maxtimes === undefined)
//       return []
//
//     return maxtimes.map(argName => {
//       const inputMap = spendContract.inputMap
//       return new Date(inputMap["contractParameters." + argName + ".timeInput.timestampTimeInput"].value)
//     })
//   }
// )

export const areSpendInputsValid = createSelector(
  getSpendInputMap,
  getClauseParameterIds,
  getClauseUnlockInput,
  (spendInputMap, parameterIds, unlockInput) => {
    const invalid = parameterIds.filter(id => {
      return !isValidInput(id, spendInputMap)
    })
    return (invalid.length === 0) && (unlockInput === undefined || isValidInput('unlockValue.accountInput', spendInputMap))
  }
)

export const getSpendContractValueId = createSelector(
  getSpendContract,
  (contract) => contract.template && ("contractValue." + contract.template.value)
)

export const getClauseValueId = createSelector(
  getSpendInputMap,
  getClauseName,
  (spendInputMap, clauseName) => {
    for (const id in spendInputMap) {
      const input = spendInputMap[id]
      const inputClauseName = input.name.split('.')[1]
      if (clauseName === inputClauseName && input.value === "valueInput") {
        return input.name
      }
    }
    return undefined
  }
)

export const getRequiredAssetAmount = createSelector(
  getClauseValueId,
  getClauseValueInfo,
  getInputMap,
  getSpendInputMap,
  (clauseValuePrefix, valueInfo, inputMap, spendInputMap) => {
    if (clauseValuePrefix === undefined) {
      return undefined
    }

    const name = clauseValuePrefix.split('.').pop()
    if (name === undefined) {
      return undefined
    }

    const valueArg = valueInfo.find(info => {
      return info.name === name
    })
    if (valueArg === undefined) {
      return undefined
    }
    const assetInput = inputMap["contractParameters." + valueArg.asset + ".assetInput"]
    const amountInput = inputMap["contractParameters." + valueArg.amount + ".amountInput"]
    if (!(assetInput && amountInput)) {
      return undefined
    }
    return {
      assetId: assetInput.computedData,
      amount: amountInput.value
    }
  }
)

// export const getSpendUnspentOutputAction = createSelector(
//   getSpendContract,
//   getSpendInputMap,
//   ( contract, spendInputMap ) => {
//     const outputId = contract.id
//     const clauseParameters = Object.keys(spendInputMap).filter(k => k.startsWith("clauseParameters"))
//     if (clauseParameters === undefined ) {
//       return undefined
//     }
//
//     const args = [{
//         "type": "raw_tx_signature",
//         "raw_data": {
//         "xpub": spendInputMap[clauseParameters[0]].value,
//           "derivation_path": [
//             spendInputMap[clauseParameters[1]].value,
//             spendInputMap[clauseParameters[2]].value
//           ]
//       }
//     }]
//
//     const spendUnspentOutput: SpendUnspentOutput = {
//       type: "spendUnspentOutput",
//       outputId,
//       arguments: args
//     }
//     return spendUnspentOutput
//   }
// )

export const getSpendUnspentOutputAction = createSelector(
  getSpendContract,
  getClauseWitnessComponents,
  (contract, witness) => {
    const outputId = contract.id
    const spendUnspentOutput: SpendUnspentOutput = {
      type: "spendUnspentOutput",
      outputId,
      arguments: witness
    }
    return spendUnspentOutput
  }
)

export const getGasAction = createSelector(
  getSpendInputMap,
  (spendInputMap) => {
    const accountId = spendInputMap["unlockValue.accountInput"].value
    const btmUnit = spendInputMap["unlockValue.gasInput.btmUnitInput"].value
    const gasAmount = spendInputMap["unlockValue.gasInput"].value

    const gas = calGas(gasAmount, btmUnit)
    const gasAction = {
      accountId: accountId,
      amount: gas,
      type: 'spendFromAccount',
      assetId: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    } as SpendFromAccount
    return gasAction
  }
)

// export const getLockActions = createSelector(
//   getSpendContract,
//   // getClauseValueInfo,
//   (contract) => {
//     const asset = contract.assetId
//     const amount = contract.amount
//
//
//     const action: ControlWithProgram = {
//       type: "controlWithProgram",
//       assetId: asset,
//       amount: amount,
//       controlProgram: controlProgram
//     }
//     return action
//   }
// )

export const getUnlockError = createSelector(
  getState,
  (state: ContractsState) => {
    const error = state.error
    // if (typeof error === 'string') {
      return error
    // }
    // return parseError(error)
  }
)

export const isFirstTime = createSelector(
  getState,
  state => state.firstTime
)

export const generateInputMap = (compiled: CompiledTemplate): InputMap => {
  let inputs: Input[] = []
  for (const param of compiled.params) {
    switch (param.type) {
      case "Sha3(PublicKey)": {
        const hashParam = {
          type: "hashType",
          inputType: "PublicKey",
          hashFunction: "sha3" as HashFunction
        }
        addParameterInput(inputs, hashParam as ClauseParameterType, "contractParameters." + param.name)
        break
      }
      case "Sha3(String)": {
        const hashParam = {
          type: "hashType",
          inputType: "String",
          hashFunction: "sha3" as HashFunction
        }
        addParameterInput(inputs, hashParam as ClauseParameterType, "contractParameters." + param.name)
        break
      }
      case "Sha256(PublicKey)": {
        const hashParam = {
          type: "hashType",
          inputType: "PublicKey",
          hashFunction: "sha256" as HashFunction
        }
        addParameterInput(inputs, hashParam as ClauseParameterType, "contractParameters." + param.name)
        break
      }
      case "Sha256(String)": {
        const hashParam = {
          type: "hashType",
          inputType: "String",
          hashFunction: "sha256" as HashFunction
        }
        addParameterInput(inputs, hashParam as ClauseParameterType, "contractParameters." + param.name)
        break
      }
      default:
        addParameterInput(inputs, param.type as ClauseParameterType, "contractParameters." + param.name)
    }
  }

  if (compiled.value !== "") {
    addParameterInput(inputs, "Value", "contractValue." + compiled.value)
  }

  const inputMap = {}
  for (let input of inputs) {
    inputMap[input.name] = input
  }
  return inputMap
}

export const generateUnlockInputMap = (compiled: CompiledTemplate): InputMap => {
  let inputs: Input[] = []
  for (const param of compiled.params) {
    switch (param.type) {
      case "Sha3(PublicKey)":
      case "Sha3(String)":
      case "Sha256(PublicKey)":
      case "Sha256(String)": {
        addParameterInput(inputs, "Hash" as ClauseParameterType, "contractParameters." + param.name)
        break
      }
      default:
        addParameterInput(inputs, param.type as ClauseParameterType, "contractParameters." + param.name)
    }
  }

  if (compiled.value !== "") {
    addParameterInput(inputs, "Value", "contractValue." + compiled.value)
  }

  const inputMap = {}
  for (let input of inputs) {
    inputMap[input.name] = input
  }
  return inputMap
}
