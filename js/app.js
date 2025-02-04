AV.init({
  appId: 'JTAfFTNcRlQCpg8HFE1krlu9-gzGzoHsz',
  appKey: 'GKTQvmBq7NQ4dD5oxVnGXAt0',
})

// var Todo = AV.Object.extend('Todo')
// // 构建对象
// var todo = new Todo();

// // 为属性赋值
// todo.set('title', '马拉松报名');
// todo.set('priority', 2);

// // 将对象保存到云端
// todo.save().then(function (todo) {
//   // 成功保存之后，执行其他逻辑
//   console.log('保存成功。objectId：' + todo.id);
// }, function (error) {
//   // 异常处理
// });
// var query = new AV.Query('Todo');
// query.get('5da709f2f884af00670c19ed').then(function (todo) {
//   // todo 就是 objectId 为 582570f38ac247004f39c24b 的 Todo 实例
//   var title     = todo.get('title');
//   var priority  = todo.get('priority');
//   var names  = todo.get('names');

//   console.log('title=' + title);
//   console.log('priority=' + priority);
//   console.log('names=' + names);

// });


// visibility filters
var filters = {
  all: function (todos) {
    return todos
  },
  active: function (todos) {
    return todos.filter(function (todo) {
      return !todo.done
    })
  },
  completed: function (todos) {
    return todos.filter(function (todo) {
      return todo.done
    })
  }
}

var bind = (subscription, initialStats, onChange) => {
  let stats = [...initialStats]
  const remove = value => {
    stats = stats.filter(target => target.id !== value.id)
    return onChange(stats)
  }
  const upsert = value => {
    let existed = false
    stats = stats.map(target => (target.id === value.id ? ((existed = true), value) : target))
    if (!existed) stats = [value, ...stats]
    return onChange(stats)
  }
  subscription.on('create', upsert)
  subscription.on('update', upsert)
  subscription.on('enter', upsert)
  subscription.on('leave', remove)
  subscription.on('delete', remove)
  return () => {
    subscription.off('create', upsert)
    subscription.off('update', upsert)
    subscription.off('enter', upsert)
    subscription.off('leave', remove)
    subscription.off('delete', remove)
  }
}

// app Vue instance
var app = new Vue({
  // app initial state
  data: {
    todos: [],
    newTodo: '',
    editedTodo: null,
    visibility: 'all',
    username: '',
    password: '',
    user: null
  },
  
  created: function() {
    var user = AV.User.current()
    if (user) {
      // user.isAuthenticated().then(function(authenticated) {
      //   if (authenticated) {
          this.user = user.toJSON()
      //   }
      // }.bind(this))
    }
  },

  watch: {
    'user.objectId': {
      handler: function (id) {
        if (id) {
          this.fetchTodos(id)
        } else {
          this.todos = []
        }
      },
    }
  },

  // computed properties
  // https://vuejs.org/guide/computed.html
  computed: {
    filteredTodos: function () {
      return filters[this.visibility](this.todos)
    },
    remaining: function () {
      return filters.active(this.todos).length
    },
    allDone: {
      get: function () {
        return this.remaining === 0
      },
      set: function (done) {
        AV.Object.saveAll(
          filters[done ? 'active' : 'completed'](this.todos).map(function(todo) {
            todo.done = done
            return AV.Object.createWithoutData('Todo', todo.objectId).set('done', done)
          })
        )
      }
    }
  },

  filters: {
    pluralize: function (n) {
      return n === 1 ? 'item' : 'items'
    }
  },

  // methods that implement data logic.
  // note there's no DOM manipulation here at all.
  methods: {
    fetchTodos: function(id) {
      const query = new AV.Query(Todo)
        .equalTo('user', AV.Object.createWithoutData('User', id))
        .descending('createdAt')
      const updateTodos = this.updateTodos.bind(this)
      return AV.Promise.all([query.find().then(updateTodos), query.subscribe()])
        .then(function([todos, subscription]) {
          this.subscription = subscription
          this.unbind = bind(subscription, todos, updateTodos)
        }.bind(this))
        .catch(alert)
    },

    login: function() {
      AV.User.logIn(this.username, this.password).then(function(user) {
        this.user = user.toJSON()
        this.username = this.password = ''
      }.bind(this)).catch(alert)
    },
    
    signup: function() {
      AV.User.signUp(this.username, this.password).then(function(user) {
        this.user = user.toJSON()
        this.username = this.password = ''
      }.bind(this)).catch(alert)
    },

    logout: function() {
      AV.User.logOut()
      this.user = null
      this.subscription.unsubscribe()
      this.unbind()
    },
    
    updateTodos: function(todos) {
      this.todos = todos.map(function(todo) {
        return todo.toJSON()
      })
      return todos
    },
    
    addTodo: function () {
      var value = this.newTodo && this.newTodo.trim()
      if (!value) {
        return
      }
      var acl = new AV.ACL()
      acl.setPublicReadAccess(false)
      acl.setPublicWriteAccess(false)
      acl.setReadAccess(AV.User.current(), true)
      acl.setWriteAccess(AV.User.current(), true)
      new Todo({
        content: value,
        done: false,
        user: AV.User.current()
      }).setACL(acl).save().then(function(todo) {
        this.todos.push(todo.toJSON())
      }.bind(this)).catch(alert)
      this.newTodo = ''
    },

    removeTodo: function (todo) {
      AV.Object.createWithoutData('Todo', todo.objectId)
        .destroy()
        .then(function() {
          this.todos.splice(this.todos.indexOf(todo), 1)
        }.bind(this))
        .catch(alert)
    },

    editTodo: function (todo) {
      this.beforeEditCache = todo.content
      this.editedTodo = todo
    },

    doneEdit: function (todo) {
      this.editedTodo = null
      todo.content = todo.content.trim()
      AV.Object.createWithoutData('Todo', todo.objectId).save({
        content: todo.content,
        done: todo.done
      }).catch(alert)
      if (!todo.content) {
        this.removeTodo(todo)
      }
    },

    cancelEdit: function (todo) {
      this.editedTodo = null
      todo.content = this.beforeEditCache
    },

    removeCompleted: function () {
      AV.Object.destroyAll(filters.completed(this.todos).map(function(todo) {
        return AV.Object.createWithoutData('Todo', todo.objectId)
      })).then(function() {
        this.todos = filters.active(this.todos)
      }.bind(this)).catch(alert)
    }
  },

  // a custom directive to wait for the DOM to be updated
  // before focusing on the input field.
  // https://vuejs.org/guide/custom-directive.html
  directives: {
    'todo-focus': function (el, value) {
      if (value) {
        el.focus()
      }
    }
  }
})

// handle routing
function onHashChange () {
  var visibility = window.location.hash.replace(/#\/?/, '')
  if (filters[visibility]) {
    app.visibility = visibility
  } else {
    window.location.hash = ''
    app.visibility = 'all'
  }
}

window.addEventListener('hashchange', onHashChange)
onHashChange()

// mount
app.$mount('.todoapp')