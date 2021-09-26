'use strict'

/**
 * Form Data Json Converter
 * @link https://github.com/brainfoolong/form-data-json
 * @licence MIT
 */
class FormDataJson {

  /**
   * Default options for toJson()
   * @type {{}}
   */
  static defaultOptionsToJson = {
    /**
     * Include all disabled field values
     * @type {boolean}
     */
    'includeDisabled': false,

    /**
     * Include all button field values
     * @type {boolean}
     */
    'includeButtonValues': false,

    /**
     * Include all unchecked radio/checkboxes as given value when they are unchecked
     * If undefined, than the unchecked field will be ignored in output
     * @type {*}
     */
    'uncheckedValue': undefined,

    /**
     * A function, where first parameter is the input field to check for, that must return true if the field should be included
     * All other return values, as well as no return value, will skip the input field in the progress
     * @type {function|null}
     */
    'inputFilter': null,

    /**
     * Does return a flat key/value list of values instead of multiple dimensions
     * This will use the original input names as key, doesn't matter how weird they are
     * Exepected keys are similar to FormData() keys
     * @type {boolean}
     */
    'flatList': false,

    /**
     * If true, than this does skip empty fields from the output
     * @type {boolean}
     */
    'skipEmpty': false,

    /**
     * A function the will be called when all file fields are read as base64 data uri
     * Note: This does modify the returned object from the original call of toJson() afterwards
     * @type {function|null}
     */
    'filesCallback': null,

    /**
     * By default, files are read as base64 data url
     * Possible values are: readAsDataURL, readAsBinaryString, readAsText, readAsArrayBuffer
     * @type {string}
     */
    'fileReaderFunction': 'readAsDataURL'
  }

  /**
   * Default options for fromJson()
   * @type {{}}
   */
  static defaultOptionsFromJson = {

    /**
     * Does expect the given values are in a flatList, previously exported with toJson
     * Instead of the default bevhiour with nested objects
     * @type {boolean}
     */
    'flatList': false,

    /**
     * If true, than all fields that are not exist in the passed values object, will be cleared/emptied
     * Not exist means, the value must be undefined
     * @type {boolean}
     */
    'clearOthers': false,

    /**
     * If true, when a fields value has changed, a "change" event will be fired
     * @type {boolean}
     */
    'triggerChangeEvent': false
  }

  /**
   * All input types that are buttons
   * @type {string[]}
   */
  static buttonInputTypes = ['button', 'submit', 'reset', 'image']

  /**
   * All input types that have a checked status
   * @type {string[]}
   */
  static checkedInputTypes = ['checkbox', 'radio']

  /**
   * Get values from all form elements inside the given element
   * @param {*} el
   * @param {Object=} options
   * @return {Object}
   */
  static toJson (el, options) {
    options = FormDataJson.merge(FormDataJson.defaultOptionsToJson, options)
    const tree = FormDataJson.getFieldTree(el, options)
    const returnObject = {}
    const files = []

    /**
     * Check if given input is valid for given filters
     * @param {HTMLElement} input
     * @param {Object} options
     * @return {boolean}
     */
    function isValidInput (input, options) {

      // filter elements by input filter
      if (typeof options.inputFilter === 'function' && options.inputFilter(input) !== true) {
        return false
      }

      // ignore disabled fields
      if (!options.includeDisabled && input.disabled) {
        return false
      }

      const inputType = (input.type || 'text').toLowerCase()

      // ignore button values
      if (!options.includeButtonValues && (input instanceof HTMLButtonElement || FormDataJson.buttonInputTypes.indexOf(inputType) > -1)) {
        return false
      }

      // ignore unchecked fields when no value is given
      if (typeof options.uncheckedValue === 'undefined' && FormDataJson.checkedInputTypes.indexOf(inputType) > -1 && !input.checked) {
        return false
      }

      return true
    }

    /**
     * Recursive get values
     * @param {Object} inputs
     * @param {Object} values
     */
    function recursion (inputs, values) {
      for (let key in inputs) {
        const row = inputs[key]
        const objectKey = options.flatList ? row.name : key
        // next level
        if (row.type === 'nested') {
          if (options.flatList) {
            recursion(row.tree, values)
          } else {
            values[key] = {}
            recursion(row.tree, values[key])
          }
          continue
        }
        const input = row.input
        // check for valid inputs by given options
        if (row.type === 'default' && !isValidInput(input, options)) {
          continue
        }
        const inputType = row.inputType

        if (inputType === 'file') {
          if (options.filesCallback) {
            files.push({ 'object': values, 'key': objectKey, 'input': input })
          }
          continue
        }

        let value = null
        if (row.type === 'radio') {
          for (let i = 0; i < row.inputs.length; i++) {
            const radioInput = row.inputs[i]
            // check for valid inputs by given options
            if (!isValidInput(radioInput, options)) continue
            if (radioInput.checked) {
              value = radioInput.value
              break
            }
          }
          if (value === null) {
            value = options.uncheckedValue
          }
        } else if (inputType === 'checkbox') {
          value = input.checked ? input.value : options.uncheckedValue
        } else if (input instanceof HTMLSelectElement) {
          let arr = []
          for (let i = 0; i < input.options.length; i++) {
            let option = input.options[i]
            if (option.selected) {
              arr.push((typeof option.value !== 'undefined' ? option.value : option.text).toString())
            }
          }
          if (input.multiple) {
            value = arr
          } else {
            value = arr.length ? arr[0] : null
          }
        } else {
          value = input.value
          if (options.skipEmpty && FormDataJson.stringify(value) === '') {
            continue
          }
        }
        values[objectKey] = value
      }
    }

    recursion(tree, returnObject)

    if (files.length) {
      let filesDone = 0
      let filesRequired = 0
      for (let i = 0; i < files.length; i++) {
        let row = files[i]
        let useObject = row.object
        filesRequired += row.input.files.length
        for (let j = 0; j < row.input.files.length; j++) {
          let file = row.input.files[j]
          let reader = new FileReader()
          reader.onload = function () {
            if (row.input.multiple) {
              if (!FormDataJson.isArray(useObject[row.key])) {
                useObject[row.key] = []
              }
              useObject[row.key].push(reader.result)
            } else {
              useObject[row.key] = reader.result
            }
            filesDone++
            if (filesDone === filesRequired) {
              options.filesCallback(FormDataJson.arrayfy(returnObject))
            }
          }
          reader[options.fileReaderFunction](file)
        }
      }
    } else if (options.filesCallback) {
      options.filesCallback(FormDataJson.arrayfy(returnObject))
    }
    return FormDataJson.arrayfy(returnObject)
  }

  /**
   * Fill given form values into all form elements inside given element
   * @param {*} el
   * @param {Object} values
   * @param {Object=} options
   * @param {string=} keyPrefix Internal only
   */
  static fromJson (el, values, options, keyPrefix) {
    if (!FormDataJson.isObject(values)) return
    options = FormDataJson.merge(FormDataJson.defaultOptionsFromJson, options)
    const tree = FormDataJson.getFieldTree(el, options)
    if (options.clearOthers) {
      FormDataJson.clear(el)
    }

    /**
     * Recursive set values
     * @param {*} inputs
     * @param {*} newValues
     */
    function recursion (inputs, newValues) {
      for (let key in inputs) {
        const row = inputs[key]
        const objectKey = options.flatList ? row.name : key
        // next level
        if (row.type === 'nested') {
          if (options.flatList) {
            recursion(row.tree, newValues)
          } else if (typeof newValues[objectKey] === 'object') {
            recursion(row.tree, newValues[objectKey])
          }
          continue
        }
        // skip fields that are not presented in the
        if (!options.clearOthers && typeof newValues[objectKey] === 'undefined') {
          continue
        }
        FormDataJson.setInputValue(row, newValues[objectKey] || null, options.triggerChangeEvent)
      }
    }

    recursion(tree, values)
  }

  /**
   * Reset all input fields in the given element to their default values
   * @param {*} el
   */
  static reset (el) {
    const tree = FormDataJson.getFieldTree(el)

    /**
     * Recursive reset
     * @param {*} inputs
     */
    function recursion (inputs) {
      for (let key in inputs) {
        const row = inputs[key]
        // next level
        if (row.type === 'nested') {
          recursion(row.tree)
          continue
        }

        if (row.type === 'radio') {
          for (let i = 0; i < row.inputs.length; i++) {
            const radioInput = row.inputs[i]
            radioInput.checked = radioInput.defaultChecked
          }
          continue
        }

        // ignore button elements, as reset would reset button labels, which is mostly not that what anybody want
        if (row.inputType && FormDataJson.buttonInputTypes.indexOf(row.inputType) > -1) {
          continue
        }
        const input = row.input
        if (FormDataJson.checkedInputTypes.indexOf(row.inputType) > -1) {
          input.checked = input.defaultChecked
        } else if (input instanceof HTMLSelectElement) {
          const options = input.querySelectorAll('option')
          for (let i = 0; i < options.length; i++) {
            const option = options[i]
            option.selected = option.defaultSelected
          }
        } else if (input.getAttribute('value')) {
          input.value = input.getAttribute('value')
        } else if (typeof input.defaultValue === 'string' || typeof input.defaultValue === 'number') {
          input.value = input.defaultValue
        }
      }
    }

    recursion(tree)
  }

  /**
   * Clear all input fields (to empty, unchecked, unselected) in the given element
   * @param {*} el
   */
  static clear (el) {
    const tree = FormDataJson.getFieldTree(el)

    /**
     * Recursive clear
     * @param {*} inputs
     */
    function recursion (inputs) {
      for (let key in inputs) {
        const row = inputs[key]
        // next level
        if (row.type === 'nested') {
          recursion(row.tree)
          continue
        }
        if (row.input) {
          // ignore button elements, as clear would unset button labels, which is mostly not that what anybody want
          if (FormDataJson.buttonInputTypes.indexOf(row.inputType) > -1) {
            continue
          }
        }
        FormDataJson.setInputValue(row, null)
      }
    }

    recursion(tree)
  }

  /**
   * Make an object to array if possible
   * @param {Object} object
   * @return {*}
   * @private
   */
  static arrayfy (object) {
    if (FormDataJson.isObject(object)) {
      let count = 0
      let valid = true
      for (let key in object) {
        if (FormDataJson.isObject(object[key]) && !(object[key] instanceof Element)) {
          object[key] = FormDataJson.arrayfy(object[key])
        }
        if (parseInt(key) !== count) {
          valid = false
        }
        count++
      }
      if (valid) {
        let arr = []
        for (let i in object) {
          arr.push(object[i])
        }
        return arr
      }
    }
    return object
  }

  /**
   * Set input value
   * @param {*} row
   * @param {*|null} newValue Null will unset the value
   * @param {boolean=} triggerChangeEvent
   * @private
   */
  static setInputValue (row, newValue, triggerChangeEvent) {
    const triggerChange = triggerChangeEvent ? function (el) {
      let ev = null
      if (typeof (Event) === 'function') {
        ev = new Event('change', { 'bubbles': true })
      } else {
        ev = document.createEvent('Event')
        ev.initEvent('change', true, true)
      }
      el.dispatchEvent(ev)
    } : null
    if (row.type === 'radio') {
      let changed = []
      for (let i = 0; i < row.inputs.length; i++) {
        const radioInput = row.inputs[i]
        if (radioInput.checked) changed.push(radioInput)
        radioInput.checked = false
        if (newValue !== null && FormDataJson.stringify(radioInput.value) === FormDataJson.stringify(newValue)) {
          if (!radioInput.checked) changed.push(radioInput)
          radioInput.checked = true
          break
        }
      }
      if (triggerChange) {
        for (let i in changed) {
          triggerChange(changed[i])
        }
      }
      return
    }

    const input = row.input
    const inputType = row.inputType

    // ignore file input, they cannot be set
    if (inputType === 'file') {
      return
    }

    let changed = false
    if (inputType === 'checkbox') {
      newValue = newValue === true || (newValue !== null && FormDataJson.stringify(input.value) === FormDataJson.stringify(newValue))
      if (newValue !== input.checked) changed = true
      input.checked = newValue
    } else if (input instanceof HTMLSelectElement) {
      let newValueArr = newValue
      if (newValueArr === null || newValueArr === undefined) {
        newValueArr = []
      } else if (FormDataJson.isObject(newValueArr)) {
        newValueArr = Object.values(newValueArr)
      } else if (!FormDataJson.isArray(newValueArr)) {
        newValueArr = [newValueArr]
      }
      for (let i = 0; i < input.options.length; i++) {
        const option = input.options[i]
        const optionValue = (typeof option.value !== 'undefined' ? option.value : option.text).toString()
        if (option.selected !== false) changed = true
        option.selected = false
        for (let j = 0; j < newValueArr.length; j++) {
          if (optionValue === FormDataJson.stringify(newValueArr[j])) {
            if (option.selected !== true) changed = true
            option.selected = true
            break
          }
        }
      }
    } else {
      if (input.value !== newValue) changed = true
      input.value = newValue
    }
    if (changed && triggerChange) {
      triggerChange(input)
    }
  }

  /**
   * Convert any value to a string
   * A object/array/undefined will be an ampty string
   * Boolean will be 1 or 0
   * @param {*} value
   * @private
   */
  static stringify (value) {
    if (value === undefined) return ''
    if (typeof value === 'object') return ''
    if (typeof value === 'boolean') return value ? '1' : '0'
    return value + ''
  }

  /**
   * Get all input fields as a multidimensional tree, as it would later appear in json data, but with input elements as values
   * @param {*} el
   * @param {Object=} options
   * @return {Object}
   * @private
   */
  static getFieldTree (el, options) {
    el = FormDataJson.getElement(el)
    if (!el) {
      return []
    }
    let inputs = el.querySelectorAll('select, textarea, input, button')
    let inputTree = {}
    let autoIncrementCounts = {}
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]
      if (!input.name || input.name.length === 0) continue
      const inputType = (input.type || 'text').toLowerCase()

      let name = input.name
      const keyParts = input.name.replace(/\]/g, '').split('[')
      if (name.substr(-2) === '[]') {
        if (input instanceof HTMLSelectElement && input.multiple) {
          // special for multiple selects, we skip the last empty part to fix double nested arrays
          keyParts.pop()
        } else if (inputType === 'radio') {
          // special for radio buttons, as they group multiple inputs to the same name
          // so a radio could never be an auto increment array name
          keyParts.pop()
        }
      }

      const keyPartsLength = keyParts.length
      let useObject = inputTree
      let currentName = ''
      for (let j = 0; j < keyPartsLength; j++) {
        let keyPart = keyParts[j]
        currentName = currentName ? currentName + '[' + keyPart + ']' : keyPart
        // auto increment key part
        if (keyPart === '') {
          if (typeof autoIncrementCounts[currentName] === 'undefined') {
            autoIncrementCounts[currentName] = 0
          }
          keyPart = autoIncrementCounts[currentName].toString()
          autoIncrementCounts[currentName]++
        }
        // last level
        if (keyPartsLength - 1 === j) {
          // radio elements are special
          if ((input.type || 'text').toLowerCase() === 'radio') {
            if (typeof useObject[keyPart] === 'undefined') {
              useObject[keyPart] = { 'type': 'radio', 'name': input.name, 'inputType': inputType, 'inputs': [] }
            }
            useObject[keyPart].inputs.push(input)
          } else {
            useObject[keyPart] = { 'type': 'default', 'name': input.name, 'inputType': inputType, 'input': input }
          }
        } else {
          // it could be possible, than really weird a non standard conform input names result in already
          // existing data which we need to override here, for which the check to .tree is for
          if (typeof useObject[keyPart] === 'undefined' || typeof useObject[keyPart].tree === 'undefined') {
            useObject[keyPart] = { 'type': 'nested', 'tree': {} }
          }
          useObject = useObject[keyPart].tree
        }
      }
    }
    return inputTree
  }

  /**
   * Check if arg is a real object (not null) and no array
   * @param {*} arg
   * @return {boolean}
   * @private
   */
  static isObject (arg) {
    return arg && typeof arg === 'object' && Object.prototype.toString.call(arg) !== '[object Array]'
  }

  /**
   * Check if arg is arr
   * @param {*} arg
   * @return {boolean}
   * @private
   */
  static isArray (arg) {
    return typeof arg === 'object' && Object.prototype.toString.call(arg) === '[object Array]'
  }

  /**
   * Get html element out of given parameter
   * @param {HTMLElement|JQuery|string} param
   * @return {HTMLElement|null}
   * @private
   */
  static getElement (param) {
    if (typeof param === 'string') return document.querySelector(param)
    if (param instanceof HTMLElement) return param
    if (typeof jQuery !== 'undefined' && param instanceof jQuery) return param[0]
    console.warn('FormDataJson: Unsupported element passed. Supported is HTMLElement, a string query selector or JQuery object')
    return null
  }

  /**
   * Merge from left to right and return a new object
   * @param {Object} a
   * @param {Object} b
   * @return {Object}
   * @private
   */
  static merge (a, b) {
    let c = {}
    for (let key in a) {
      c[key] = a[key]
    }
    for (let key in b) {
      c[key] = b[key]
    }
    return c
  }
}

// module exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormDataJson
}